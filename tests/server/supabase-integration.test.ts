import { describe, expect, it } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseStore } from "@/lib/server/supabase-store";
import { actOnRoom, createRoom, joinRoom, readRoom } from "@/lib/server/rooms";
import type { Room, RoomAction, RoomSnapshot, RoomStore } from "@/lib/server/types";
const configured = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
function adapter() {
  return createSupabaseStore(createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}
async function cleanup(store: RoomStore, code: string, sessions: string[]) {
  for (const session of sessions) {
    const current = await store.read(code);
    if (!current?.players.some((p) => p.sessionHash === session)) continue;
    await actOnRoom(store, code, session, { expectedRevision: current.revision, actionId: randomUUID(), action: { type: "leave" } });
  }
}
async function send(store: RoomStore, code: string, session: string, action: RoomAction): Promise<RoomSnapshot> {
  const current = await readRoom(store, code, session);
  return actOnRoom(store, code, session, { expectedRevision: current.revision, actionId: randomUUID(), action });
}
describe.skipIf(!configured)("live dedicated Supabase storage", () => {
  it("shares a room across adapters and admits only one competing last-seat guest", async () => {
    const a = adapter(), b = adapter(), sessions = Array.from({ length: 5 }, () => "test-" + randomUUID());
    const created = await createRoom(a, sessions[0], "Live host");
    try {
      await joinRoom(b, created.code, sessions[1], "Guest two");
      await joinRoom(a, created.code, sessions[2], "Guest three");
      const result = await Promise.allSettled([joinRoom(a, created.code, sessions[3], "Guest four"), joinRoom(b, created.code, sessions[4], "Guest five")]);
      expect(result.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      expect((await readRoom(b, created.code, sessions[0])).players).toHaveLength(4);
      expect(await b.activeRoom(sessions[0])).toBe(created.code);
    } finally { await cleanup(a, created.code, sessions); }
    expect(await a.read(created.code)).toBeNull();
  }, 60_000);
  it("keeps a lost-response draw retry safe across real database requests", async () => {
    const a = adapter(), b = adapter(), sessions = ["test-" + randomUUID(), "test-" + randomUUID()];
    const created = await createRoom(a, sessions[0], "Retry host");
    try {
      await joinRoom(b, created.code, sessions[1], "Retry guest");
      for (const session of sessions) await send(a, created.code, session, { type: "ready", ready: true });
      const started = await send(a, created.code, sessions[0], { type: "start" });
      expect(started.hand).toHaveLength(7);
      const request = { expectedRevision: started.revision, actionId: randomUUID(), action: { type: "draw" as const } };
      const original = await actOnRoom(a, created.code, sessions[0], request);
      const replay = await actOnRoom(b, created.code, sessions[0], request);
      expect(replay.hand).toHaveLength(8); expect(replay.hand).toEqual(original.hand);
      expect(replay.revision).toBe(original.revision);
      const guest = await readRoom(b, created.code, sessions[1]);
      expect(guest.hand.some((c) => replay.hand.some((own) => c.id === own.id))).toBe(false);
    } finally { await cleanup(a, created.code, sessions); }
  }, 60_000);
  it("round-trips numeric room codes and frees membership when the guest leaves", async () => {
    const store = adapter(), session = "test-" + randomUUID();
    const code = Array.from({ length: 6 }, () => "23456789"[randomInt(8)]).join("");
    const host = { id: randomUUID(), sessionHash: session, name: "Numeric host", ready: false, lastSeen: Date.now(), wins: 0 };
    const raw: Room = { schemaVersion: 1, code, revision: 0, actionRevision: 0, hostId: host.id, phase: "lobby", players: [host], game: null, winnerName: null, chat: [], events: [], acceptedActions: [], storageMode: "supabase" };
    expect(await store.create(raw, session)).toBe(true);
    try {
      expect(await store.activeRoom(session)).toBe(code);
      expect((await joinRoom(store, code, session, "Numeric host")).players).toHaveLength(1);
    } finally { await cleanup(store, code, [session]); }
    expect(await store.activeRoom(session)).toBeNull();
  }, 60_000);
});
