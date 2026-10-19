import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const url = process.env.TEST_DATABASE_URL;
export const pool = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10_000 });
export function migrationSql(): string {
  return readdirSync(resolve("supabase/migrations")).filter((file) => file.endsWith(".sql") && !file.endsWith("_uno_cron.sql")).sort().map((file) => readFileSync(resolve("supabase/migrations", file), "utf8")).join("\n");
}
export async function setupDatabase() {
  if (!url || new URL(url).pathname !== "/uno_test") throw new Error("SQL tests require TEST_DATABASE_URL pointing to a disposable database named uno_test.");
  const result = await pool.query<{ name: string }>("select current_database() as name");
  if (result.rows[0].name !== "uno_test") throw new Error("Refusing SQL test mutations outside uno_test.");
  await pool.query("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;");
  const sql = migrationSql(); if (sql.trim()) await pool.query(sql);
}
export async function resetDatabase() {
  const { rows } = await pool.query("select to_regclass('uno_private.rooms') as name");
  if (rows[0].name) await pool.query("truncate uno_private.memberships, uno_private.rooms, uno_private.rate_limits");
}
export async function scalar<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await pool.query<{ value: T }>(sql, params)).rows[0].value;
}
export function room(code = "ABC234", sessions = ["host"]) {
  return {
    schemaVersion: 1, code, revision: 0, actionRevision: 0, hostId: "player-" + sessions[0], phase: "lobby",
    players: sessions.map((sessionHash) => ({ id: "player-" + sessionHash, sessionHash, name: sessionHash, ready: false, lastSeen: Date.now(), wins: 0 })),
    game: null, winnerName: null, chat: [], events: [], acceptedActions: [], storageMode: "supabase",
  };
}
export const create = (value: ReturnType<typeof room>, session = value.players[0].sessionHash) =>
  scalar<boolean>("select public.uno_room_create($1::jsonb,$2::text) as value", [JSON.stringify(value), session]);
export const commit = (previous: number, value: ReturnType<typeof room>, added: string | null = null) =>
  scalar<boolean>("select public.uno_room_commit($1::bigint,$2::jsonb,$3::text) as value", [previous, JSON.stringify(value), added]);
export const read = (code = "ABC234") => scalar<ReturnType<typeof room> | null>("select public.uno_room_read($1) as value", [code]);
export const active = (session = "host") => scalar<string | null>("select public.uno_active_room($1) as value", [session]);
