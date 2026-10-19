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
  -- Lock the room key before membership rows, matching cleanup's FK cascade.
  insert into uno_private.rooms(code,revision,state,expires_at)
    values(p_room->>'code',(p_room->>'revision')::bigint,p_room,clock_timestamp()+interval '24 hours');
  delete from uno_private.memberships m
    where m.session_hash in(select p->>'sessionHash' from jsonb_array_elements(p_room->'players') p)
      and not exists(select from uno_private.rooms r where r.code=m.room_code and r.expires_at>clock_timestamp());
  insert into uno_private.memberships(session_hash,room_code)
    select p->>'sessionHash',p_room->>'code' from jsonb_array_elements(p_room->'players') p;
  return true;
exception when unique_violation then return false;
end;
$$;

revoke all on function public.uno_room_create(jsonb,text) from public, anon, authenticated;
grant execute on function public.uno_room_create(jsonb,text) to service_role;
notify pgrst, 'reload schema';
