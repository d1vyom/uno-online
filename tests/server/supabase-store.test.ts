import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseStore } from "@/lib/server/supabase-store";
import type { Room } from "@/lib/server/types";

afterEach(() => vi.unstubAllGlobals());
const stored = () => ({
  schemaVersion: 1, code: "ABC234", revision: 0, actionRevision: 0, hostId: "player-host", phase: "lobby",
  players: [{ id: "player-host", sessionHash: "host", name: "Host", ready: false, lastSeen: 1_000_000, wins: 0 }],
  game: null, winnerName: null, chat: [], events: [], acceptedActions: [], storageMode: "supabase",
});
function adapter(value: unknown, status = 200) {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
    return new Response(value === undefined ? null : JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://example.supabase.co", "sb_secret_contract-test", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { store: createSupabaseStore(client), requests };
}
describe("Supabase RPC boundary", () => {
  it("returns a numeric-only membership code as text", async () => {
    const { store, requests } = adapter("234567");
    expect(await store.activeRoom("guest-hash")).toBe("234567");
    expect(requests[0].url).toBe("https://example.supabase.co/rest/v1/rpc/uno_active_room");
    expect(requests[0].body).toEqual({ p_session_hash: "guest-hash" });
  });
  it("distinguishes an absent room from a database error", async () => {
    expect(await adapter(null).store.read("ABC234")).toBeNull();
    await expect(adapter({ message: "permission denied", code: "42501" }, 403).store.read("ABC234")).rejects.toMatchObject({ status: 503 });
  });
  it.each([404, 204])("rejects an empty HTTP %i instead of reporting an absent room", async (status) => {
    await expect(adapter(undefined, status).store.read("ABC234")).rejects.toMatchObject({ status: 503 });
  });
  it.each([404, 204])("rejects an empty HTTP %i instead of reporting no membership", async (status) => {
    await expect(adapter(undefined, status).store.activeRoom("host")).rejects.toMatchObject({ status: 503 });
  });
  it("reads the stored room without exposing an SDK response envelope", async () => {
    const value = stored(), { store, requests } = adapter(value);
    expect(await store.read("ABC234")).toEqual(value);
    expect(requests[0].body).toEqual({ p_code: "ABC234" });
    expect(store.mode).toBe("supabase");
  });
  it("preserves legitimate false and true mutation results", async () => {
    expect(await adapter(false).store.create(stored() as unknown as Room, "host")).toBe(false);
    expect(await adapter(true).store.create(stored() as unknown as Room, "host")).toBe(true);
  });
  it.each([null, 0, 1, "true", {}, []])("rejects malformed write result %j", async (value) => {
    await expect(adapter(value).store.commit(0, { ...stored(), revision: 1 } as unknown as Room)).rejects.toMatchObject({ status: 503 });
  });
  it("uses named transactional commit arguments without separate membership writes", async () => {
    const next = { ...stored(), revision: 1 } as unknown as Room, { store, requests } = adapter(true);
    expect(await store.commit(0, next, { add: "guest", remove: ["old-guest"] })).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/rpc/uno_room_commit");
    expect(requests[0].body).toEqual({ p_expected_revision: 0, p_room: next, p_added_session_hash: "guest" });
  });
  it("uses the database-backed rate limit and passes literal settings", async () => {
    const { store, requests } = adapter(false);
    expect(await store.consumeLimit("actions:hash", 30, 10)).toBe(false);
    expect(requests[0].body).toEqual({ p_key: "actions:hash", p_maximum: 30, p_window_seconds: 10 });
  });
  it.each([{ schemaVersion: 7 }, { code: "DEF567" }, { revision: -1 }, { revision: 1.5 }, { actionRevision: 2 }, { players: [] }, { players: [{ id: "only-id" }] }, { game: {} }])(
    "rejects malformed or mismatched room data %j", async (change) => {
      await expect(adapter({ ...stored(), ...change }).store.read("ABC234")).rejects.toMatchObject({ status: 503 });
    });
  it.each([123456, "bad-code", {}, true])("rejects malformed membership result %j", async (value) => {
    await expect(adapter(value).store.activeRoom("host")).rejects.toMatchObject({ status: 503 });
  });
  it("fails closed when the network is unavailable", async () => {
    const { store } = adapter(null);
    vi.stubGlobal("fetch", async () => { throw new TypeError("network unavailable"); });
    await expect(store.read("ABC234")).rejects.toMatchObject({ status: 503 });
  });
});
