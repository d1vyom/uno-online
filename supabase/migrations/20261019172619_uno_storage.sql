-- Private room state is never exposed to browser database roles.
create schema if not exists uno_private;
revoke all on schema uno_private from public, anon, authenticated;

create table if not exists uno_private.rooms (
  code text primary key,
  revision bigint not null check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  expires_at timestamptz not null,
  check (state->>'code' = code),
  check ((state->>'revision')::bigint = revision)
);
create index if not exists uno_rooms_expiry on uno_private.rooms(expires_at);
create table if not exists uno_private.memberships (
  session_hash text primary key,
  room_code text not null references uno_private.rooms(code) on delete cascade
);
create index if not exists uno_memberships_room on uno_private.memberships(room_code);
create table if not exists uno_private.rate_limits (
  key_hash text primary key,
  count bigint not null check (count > 0),
  reset_at timestamptz not null
);
create index if not exists uno_rate_expiry on uno_private.rate_limits(reset_at);
alter table uno_private.rooms enable row level security;
alter table uno_private.memberships enable row level security;
alter table uno_private.rate_limits enable row level security;
revoke all on all tables in schema uno_private from public, anon, authenticated;

create or replace function uno_private.valid_room(p_room jsonb, p_allow_empty boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_count integer;
begin
  if jsonb_typeof(p_room) is distinct from 'object'
    or p_room->'schemaVersion' is distinct from '1'::jsonb
    or p_room->>'storageMode' is distinct from 'supabase'
    or not coalesce(p_room->>'code' ~ '^[A-Z2-9]{6}$',false)
    or jsonb_typeof(p_room->'players') is distinct from 'array'
    or jsonb_typeof(p_room->'revision') is distinct from 'number'
    or not coalesce(p_room->>'phase' in ('lobby','playing','finished'),false)
    then return false; end if;
  if (p_room->>'revision')::bigint < 0 or (p_room->>'revision')::bigint > 9007199254740991 then return false; end if;
  v_count := jsonb_array_length(p_room->'players');
  if v_count > 4 or (v_count = 0 and not p_allow_empty) then return false; end if;
  if exists(select from jsonb_array_elements(p_room->'players') p
    where jsonb_typeof(p) is distinct from 'object'
      or coalesce(length(p->>'sessionHash'),0) not between 1 and 200
      or coalesce(length(p->>'id'),0) not between 1 and 100)
    then return false; end if;
  if (select count(distinct p->>'sessionHash') from jsonb_array_elements(p_room->'players') p) <> v_count
    or (select count(distinct p->>'id') from jsonb_array_elements(p_room->'players') p) <> v_count
    then return false; end if;
  if v_count > 0 and not exists(select from jsonb_array_elements(p_room->'players') p where p->>'id'=p_room->>'hostId') then return false; end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;

create or replace function public.uno_room_read(p_code text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select state from uno_private.rooms where code=p_code and expires_at>clock_timestamp();
$$;

create or replace function public.uno_active_room(p_session_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if coalesce(length(p_session_hash),0) not between 1 and 200 then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_hash,45181));
  select m.room_code into v_code from uno_private.memberships m
    join uno_private.rooms r on r.code=m.room_code
    where m.session_hash=p_session_hash and r.expires_at>clock_timestamp()
      and exists(select from jsonb_array_elements(r.state->'players') p where p->>'sessionHash'=p_session_hash);
  if found then return v_code; end if;
  delete from uno_private.memberships where session_hash=p_session_hash;
  return null;
end;
$$;

create or replace function public.uno_room_create(p_room jsonb, p_session_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_lock bigint;
begin
  if not uno_private.valid_room(p_room)
    or not exists(select from jsonb_array_elements(p_room->'players') p where p->>'sessionHash'=p_session_hash and p->>'id'=p_room->>'hostId')
    then return false; end if;
  -- Per-session transaction locks also serialize membership when no index row exists.
  -- Always sort lock keys; unrelated sessions and rooms remain independent.
  for v_lock in select distinct hashtextextended(p->>'sessionHash',45181) as key
    from jsonb_array_elements(p_room->'players') p order by key
    loop perform pg_advisory_xact_lock(v_lock); end loop;
  if exists(select from uno_private.memberships m join uno_private.rooms r on r.code=m.room_code
    where r.expires_at>clock_timestamp() and m.session_hash in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p))
    then return false; end if;
  delete from uno_private.memberships m
    where m.session_hash in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p)
      and not exists(select from uno_private.rooms r where r.code=m.room_code and r.expires_at>clock_timestamp());
  insert into uno_private.rooms(code,revision,state,expires_at)
    values(p_room->>'code',(p_room->>'revision')::bigint,p_room,clock_timestamp()+interval '24 hours');
  insert into uno_private.memberships(session_hash,room_code)
    select p->>'sessionHash',p_room->>'code' from jsonb_array_elements(p_room->'players') p;
  return true;
exception when unique_violation then return false;
end;
$$;

create or replace function public.uno_room_commit(p_expected_revision bigint,p_room jsonb,p_added_session_hash text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_current jsonb; v_revision bigint; v_lock bigint; v_added text[];
begin
  if not uno_private.valid_room(p_room,true)
    or p_expected_revision is null or p_expected_revision < 0
    or (p_room->>'revision')::bigint <> p_expected_revision+1 then return false; end if;
  select state into v_before from uno_private.rooms
    where code=p_room->>'code' and expires_at>clock_timestamp();
  if not found then return false; end if;
  -- Read identities, lock their ordered keys, then lock/recheck the room revision.
  for v_lock in select distinct hashtextextended(p->>'sessionHash',45181) as key
    from jsonb_array_elements((v_before->'players')||(p_room->'players')) p order by key
    loop perform pg_advisory_xact_lock(v_lock); end loop;
  select state,revision into v_current,v_revision from uno_private.rooms
    where code=p_room->>'code' and expires_at>clock_timestamp() for update;
  if not found or v_revision <> p_expected_revision then return false; end if;
  select array_agg(p->>'sessionHash') into v_added from jsonb_array_elements(p_room->'players') p
    where not exists(select from jsonb_array_elements(v_current->'players') old where old->>'sessionHash'=p->>'sessionHash');
  if coalesce(cardinality(v_added),0)>1
    or (coalesce(cardinality(v_added),0)=1 and p_added_session_hash is distinct from v_added[1])
    or (coalesce(cardinality(v_added),0)=0 and p_added_session_hash is not null) then return false; end if;
  if exists(select from uno_private.memberships m join uno_private.rooms r on r.code=m.room_code
    where m.room_code<>p_room->>'code' and r.expires_at>clock_timestamp()
      and m.session_hash in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p)) then return false; end if;
  if jsonb_array_length(p_room->'players')=0 then
    delete from uno_private.rooms where code=p_room->>'code'; return true;
  end if;
  delete from uno_private.memberships m
    where m.room_code=p_room->>'code'
      and m.session_hash not in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p);
  delete from uno_private.memberships m
    where m.room_code<>p_room->>'code'
      and m.session_hash in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p)
      and not exists(select from uno_private.rooms r where r.code=m.room_code and r.expires_at>clock_timestamp());
  update uno_private.rooms set state=p_room,revision=(p_room->>'revision')::bigint,
    expires_at=clock_timestamp()+interval '24 hours' where code=p_room->>'code';
  insert into uno_private.memberships(session_hash,room_code)
    select p->>'sessionHash',p_room->>'code' from jsonb_array_elements(p_room->'players') p
    on conflict(session_hash) do update set room_code=excluded.room_code;
  return true;
exception when unique_violation then return false;
end;
$$;

create or replace function public.uno_take_rate_limit(p_key text,p_maximum integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_count bigint;
begin
  if p_key is null or length(p_key)=0 or p_maximum is null or p_maximum<=0 or p_window_seconds is null or p_window_seconds<=0
    then raise exception 'Invalid rate limit' using errcode='22023'; end if;
  insert into uno_private.rate_limits as previous(key_hash,count,reset_at)
    values(md5(p_key),1,v_now+make_interval(secs=>p_window_seconds))
    on conflict(key_hash) do update set
      count=case when previous.reset_at<=v_now then 1 else previous.count+1 end,
      reset_at=case when previous.reset_at<=v_now then v_now+make_interval(secs=>p_window_seconds) else previous.reset_at end
    returning count into v_count;
  return v_count<=p_maximum;
end;
$$;

create or replace function public.uno_prune_expired()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rooms integer; v_rates integer;
begin
  with expired as (
    select code from uno_private.rooms where expires_at<=clock_timestamp()
      order by expires_at,code for update skip locked limit 500
  ) delete from uno_private.rooms r using expired e where r.code=e.code and r.expires_at<=clock_timestamp();
  get diagnostics v_rooms = row_count;
  with expired as (
    select key_hash from uno_private.rate_limits where reset_at<=clock_timestamp()
      order by reset_at,key_hash for update skip locked limit 500
  ) delete from uno_private.rate_limits r using expired e where r.key_hash=e.key_hash and r.reset_at<=clock_timestamp();
  get diagnostics v_rates = row_count;
  return jsonb_build_object('rooms',v_rooms,'rate_limits',v_rates);
end;
$$;

revoke all on function uno_private.valid_room(jsonb,boolean) from public, anon, authenticated;
revoke all on function public.uno_room_read(text) from public, anon, authenticated;
revoke all on function public.uno_active_room(text) from public, anon, authenticated;
revoke all on function public.uno_room_create(jsonb,text) from public, anon, authenticated;
revoke all on function public.uno_room_commit(bigint,jsonb,text) from public, anon, authenticated;
revoke all on function public.uno_take_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke all on function public.uno_prune_expired() from public, anon, authenticated;
grant usage on schema public to service_role;
grant execute on function public.uno_room_read(text), public.uno_active_room(text),
  public.uno_room_create(jsonb,text), public.uno_room_commit(bigint,jsonb,text),
  public.uno_take_rate_limit(text,integer,integer), public.uno_prune_expired() to service_role;
notify pgrst, 'reload schema';
