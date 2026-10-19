import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { active, commit, create, migrationSql, pool, read, resetDatabase, room, scalar, setupDatabase } from "./setup";

beforeAll(setupDatabase);
beforeEach(resetDatabase);
afterAll(async () => { await pool.end(); });

describe("transactional room storage", () => {
  it("creates one room for one session atomically without orphan rows", async () => {
    const results = await Promise.all([create(room("ABC234")), create(room("DEF567"))]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(Number(await scalar("select count(*) as value from uno_private.rooms"))).toBe(1);
    expect(Number(await scalar("select count(*) as value from uno_private.memberships"))).toBe(1);
  });
  it("does not replace a room on code collision", async () => {
    expect(await create(room())).toBe(true);
    expect(await create(room("ABC234", ["other"]))).toBe(false);
    expect((await read())?.players[0].sessionHash).toBe("host");
    expect(await active("other")).toBeNull();
  });
  it("returns numeric codes as text and returns null for unknown rooms", async () => {
    expect(await create(room("234567"))).toBe(true);
    expect(await active()).toBe("234567");
    expect(await read("QQQQQQ")).toBeNull();
  });
  it("permits exactly one same-revision last-seat commit", async () => {
    const before = room("ABC234", ["a", "b", "c"]); await create(before);
    const first = { ...room("ABC234", ["a", "b", "c", "d"]), revision: 1 };
    const second = { ...room("ABC234", ["a", "b", "c", "e"]), revision: 1 };
    const result = await Promise.all([commit(0, first, "d"), commit(0, second, "e")]);
    expect(result.filter(Boolean)).toHaveLength(1);
    expect((await read())?.players).toHaveLength(4);
    expect([await active("d"), await active("e")].filter(Boolean)).toHaveLength(1);
  });
  it("rejects stale commits without changing stored state", async () => {
    const initial = room(); await create(initial);
    expect(await commit(1, { ...initial, revision: 2 })).toBe(false);
    expect((await read())?.revision).toBe(0);
  });
  it("cannot seat one guest in two rooms through competing joins", async () => {
    await create(room("ABC234", ["host-a"])); await create(room("DEF567", ["host-b"]));
    const results = await Promise.all([
      commit(0, { ...room("ABC234", ["host-a", "guest"]), revision: 1 }, "guest"),
      commit(0, { ...room("DEF567", ["host-b", "guest"]), revision: 1 }, "guest"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(Number(await scalar("select count(*) as value from uno_private.memberships where session_hash='guest'"))).toBe(1);
    expect([await read("ABC234"), await read("DEF567")].map((r) => r?.players.length).sort()).toEqual([1, 2]);
  });
  it("rejects mismatched added-session arguments and duplicate identities atomically", async () => {
    await create(room());
    const next = { ...room("ABC234", ["host", "guest"]), revision: 1 };
    expect(await commit(0, next, "someone-else")).toBe(false);
    expect(await commit(0, { ...room("ABC234", ["host", "host"]), revision: 1 }, "host")).toBe(false);
    expect((await read())?.players).toHaveLength(1);
    expect(await active("guest")).toBeNull();
  });
  it("requires a single-step revision and a real new-member declaration", async () => {
    const initial = room(); await create(initial);
    expect(await commit(0, { ...initial, revision: 9 })).toBe(false);
    expect(await commit(0, { ...room("ABC234", ["host", "guest"]), revision: 1 })).toBe(false);
    expect((await read())?.revision).toBe(0);
  });
  it("rejects five-player and malformed states without changing memberships", async () => {
    await create(room());
    expect(await commit(0, { ...room("ABC234", ["host", "b", "c", "d", "e"]), revision: 1 }, "b")).toBe(false);
    expect(await create({ ...room("DEF567", ["other"]), schemaVersion: 8 })).toBe(false);
    expect((await read())?.players).toHaveLength(1);
    expect(await active("other")).toBeNull();
  });
  it("releases removed memberships and deletes an empty room", async () => {
    await create(room("ABC234", ["a", "b"]));
    expect(await commit(0, { ...room("ABC234", ["a"]), revision: 1 })).toBe(true);
    expect(await active("b")).toBeNull();
    expect(await commit(1, { ...room("ABC234", ["a"]), revision: 2, players: [], hostId: "" })).toBe(true);
    expect(await read()).toBeNull(); expect(await active("a")).toBeNull();
  });
});

describe("expiration and rate limits", () => {
  it("hides expired rooms, clears stale membership, and permits a new seat", async () => {
    await create(room());
    await pool.query("update uno_private.rooms set expires_at=clock_timestamp()-interval '1 second'");
    expect(await read()).toBeNull(); expect(await active()).toBeNull();
    expect(await create(room("DEF567"))).toBe(true);
  });
  it("refreshes room expiry to twenty-four hours on a commit", async () => {
    const initial = room(); await create(initial);
    await pool.query("update uno_private.rooms set expires_at=clock_timestamp()+interval '1 minute'");
    expect(await commit(0, { ...initial, revision: 1 })).toBe(true);
    const seconds = Number(await scalar("select extract(epoch from expires_at-clock_timestamp()) as value from uno_private.rooms"));
    expect(seconds).toBeGreaterThan(86390); expect(seconds).toBeLessThanOrEqual(86400);
  });
  it("increments a fixed rate window atomically and resets it in place", async () => {
    const query = "select public.uno_take_rate_limit('same-key',2,10) as value";
    const result = await Promise.all([scalar<boolean>(query), scalar<boolean>(query), scalar<boolean>(query)]);
    expect(result.filter(Boolean)).toHaveLength(2);
    await pool.query("update uno_private.rate_limits set reset_at=clock_timestamp()-interval '1 second'");
    expect(await scalar(query)).toBe(true);
    expect(Number(await scalar("select count(*) as value from uno_private.rate_limits"))).toBe(1);
  });
  it("rejects invalid rate-limit settings", async () => {
    await expect(scalar("select public.uno_take_rate_limit('invalid',0,10) as value")).rejects.toThrow();
    await expect(scalar("select public.uno_take_rate_limit('invalid',2,-1) as value")).rejects.toThrow();
  });
  it("prunes expired rooms, cascading memberships and expired rate counters", async () => {
    await create(room()); await create(room("DEF567", ["active"]));
    await pool.query("update uno_private.rooms set expires_at=clock_timestamp()-interval '1 second' where code='ABC234'");
    await scalar("select public.uno_take_rate_limit('old',2,10) as value");
    await pool.query("update uno_private.rate_limits set reset_at=clock_timestamp()-interval '1 second'");
    expect(await scalar("select public.uno_prune_expired() as value")).toEqual({ rooms: 1, rate_limits: 1 });
    expect(await read()).toBeNull(); expect(await active()).toBeNull();
    expect(await read("DEF567")).not.toBeNull();
  });
  it("bounds one cleanup call to five hundred expired rooms", async () => {
    await pool.query("insert into uno_private.rooms(code,revision,state,expires_at) select code,0,jsonb_set($1::jsonb,'{code}',to_jsonb(code)),clock_timestamp()-interval '1 second' from (select 'X'||chr(65+i/26)||chr(65+i%26)||'AAA' as code from generate_series(0,500) i) seeds", [JSON.stringify(room())]);
    const result = await scalar<{ rooms: number }>("select public.uno_prune_expired() as value");
    expect(result.rooms).toBe(500);
    expect(Number(await scalar("select count(*) as value from uno_private.rooms"))).toBe(1);
  });
  it("skips a locked expired room being renewed instead of deleting it", async () => {
    await create(room());
    await pool.query("update uno_private.rooms set expires_at=clock_timestamp()-interval '1 second'");
    const renewal = await pool.connect();
    try {
      await renewal.query("begin");
      await renewal.query("update uno_private.rooms set expires_at=clock_timestamp()+interval '1 day' where code='ABC234'");
      const result = await scalar<{ rooms: number }>("select public.uno_prune_expired() as value");
      expect(result.rooms).toBe(0);
      await renewal.query("commit");
      expect(await read()).not.toBeNull();
    } finally { await renewal.query("rollback"); renewal.release(); }
  });
  it("does not deadlock code reservation against expiry cleanup", async () => {
    await create(room());
    await pool.query("update uno_private.rooms set expires_at=clock_timestamp()-interval '1 second'");
    const gate = await pool.connect(), creator = await pool.connect(), cleaner = await pool.connect();
    type Outcome = { error: unknown };
    let creation: Promise<Outcome> | undefined, pruning: Promise<Outcome> | undefined;
    try {
      // Pause deletion at a real statement boundary so cleanup can overlap it.
      // This trigger exists only in the disposable uno_test database.
      await pool.query("create function uno_private.test_pause_membership_delete() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(9134751); return old; end $$; create trigger test_pause_membership_delete after delete on uno_private.memberships for each row execute function uno_private.test_pause_membership_delete()");
      await gate.query("select pg_advisory_lock(9134751)");
      const creatorPid = (await creator.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
      const cleanerPid = (await cleaner.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
      let created = false, pruned = false;
      creation = creator.query("select public.uno_room_create($1::jsonb,'host')", [JSON.stringify(room())])
        .then(() => ({ error: null }), (error: unknown) => ({ error })).finally(() => { created = true; });
      const blockedOrFinished = async (pid: number, finished: () => boolean) => {
        for (let i = 0; i < 100; i++) {
          if (finished()) return;
          const state = await pool.query<{ wait_event_type: string | null }>("select wait_event_type from pg_stat_activity where pid=$1", [pid]);
          if (state.rows[0].wait_event_type === "Lock") return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error("Database operation neither completed nor reached the concurrency barrier");
      };
      await blockedOrFinished(creatorPid, () => created);
      pruning = cleaner.query("select public.uno_prune_expired()")
        .then(() => ({ error: null }), (error: unknown) => ({ error })).finally(() => { pruned = true; });
      await blockedOrFinished(cleanerPid, () => pruned);
      await gate.query("select pg_advisory_unlock(9134751)");
      const outcomes = await Promise.all([creation, pruning]);
      expect(outcomes.map((outcome) => outcome.error)).toEqual([null, null]);
      // A colliding reservation may return false; retry after cleanup must work.
      if (!(await read())) expect(await create(room())).toBe(true);
      expect(await active()).toBe("ABC234");
    } finally {
      await gate.query("select pg_advisory_unlock(9134751)");
      await Promise.all([creation, pruning]);
      await pool.query("drop trigger if exists test_pause_membership_delete on uno_private.memberships; drop function if exists uno_private.test_pause_membership_delete()");
      gate.release(); creator.release(); cleaner.release();
    }
  });

});

describe("database privileges", () => {
  it.each(["anon", "authenticated"])("denies %s direct reads and backend RPC execution", async (role) => {
    await create(room());
    const connection = await pool.connect();
    try {
      await connection.query("set role " + role);
      await expect(connection.query("select * from uno_private.rooms")).rejects.toThrow(/permission denied/i);
      await expect(connection.query("select public.uno_room_read('ABC234')")).rejects.toThrow(/permission denied/i);
    } finally { await connection.query("reset role"); connection.release(); }
    const rows = await pool.query<{ allowed: boolean }>("select has_function_privilege($1, oid, 'EXECUTE') as allowed from pg_proc where pronamespace='public'::regnamespace and proname like 'uno_%'", [role]);
    expect(rows.rows.length).toBe(6); expect(rows.rows.every((row) => !row.allowed)).toBe(true);
  });
  it("permits service_role RPC execution without exposing table access", async () => {
    await create(room());
    const connection = await pool.connect();
    try {
      await connection.query("set role service_role");
      expect((await connection.query("select public.uno_active_room('host') as value")).rows[0].value).toBe("ABC234");
    } finally { await connection.query("reset role"); connection.release(); }
  });
  it("retains existing rooms and secure privileges when migration is reapplied", async () => {
    await create(room()); await pool.query(migrationSql());
    expect(await active()).toBe("ABC234");
    expect(await scalar("select has_function_privilege('anon','public.uno_room_read(text)','EXECUTE') as value")).toBe(false);
    const result = await pool.query<{ proconfig: string[]; prosecdef: boolean }>("select proconfig,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname like 'uno_%'");
    expect(result.rows).toHaveLength(6);
    expect(result.rows.every((row) => row.prosecdef && row.proconfig.includes('search_path=""'))).toBe(true);
  });
});
