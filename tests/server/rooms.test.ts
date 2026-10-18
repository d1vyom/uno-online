import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore, getStore } from "@/lib/server/store";
import { actOnRoom, createRoom, joinRoom, readRoom } from "@/lib/server/rooms";
import type { RoomAction, RoomSnapshot, RoomStore } from "@/lib/server/types";

let store: RoomStore, tick: number, sequence: number;
beforeEach(() => { tick = 1_000_000; sequence = 0; store = createMemoryStore(() => tick); });
async function action(snapshot: RoomSnapshot, session: string, value: RoomAction) {
  const current = await readRoom(store, snapshot.code, session, tick);
  return actOnRoom(store, current.code, session, {
    expectedRevision: current.revision, actionId: "test-action-" + sequence++, action: value,
  }, tick);
}
async function table(count = 4) {
  let room = await createRoom(store, "session-a", "Alice", tick);
  for (let i = 1; i < count; i++) room = await joinRoom(store, room.code, "session-" + "abcd"[i], ["Alice", "Ben", "Cleo", "Dev"][i], tick);
  return room;
}
async function started(count = 4) {
  let room = await table(count);
  for (const letter of "abcd".slice(0, count)) room = await action(room, "session-" + letter, { type: "ready", ready: true });
  return action(room, "session-a", { type: "start" });
}

describe("private rooms", () => {
  it("creates a named guest room and rejects duplicate memberships", async () => {
    const room = await createRoom(store, "session-a", " Alice ", tick);
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.players[0].name).toBe("Alice");
    expect(room.players[0].id).toBe(room.myId);
    await expect(createRoom(store, "session-a", "Alice", tick)).rejects.toThrow();
    await expect(joinRoom(store, "AAAAAA", "session-a", "Alice", tick)).rejects.toThrow();
  });
  it("validates empty, oversized, and control-character names", async () => {
    for (const name of ["", " ", "x".repeat(25), "a\u0000b"]) {
      await expect(createRoom(store, "session-a", name, tick)).rejects.toThrow();
    }
  });
  it("normalizes room codes and rejects malformed codes", async () => {
    const room = await createRoom(store, "session-a", "Alice", tick);
    expect((await joinRoom(store, " " + room.code.toLowerCase() + " ", "session-b", "Ben", tick)).players).toHaveLength(2);
    await expect(readRoom(store, "../../oops", "session-a", tick)).rejects.toThrow();
  });
  it("permits a session to rejoin its seat without adding a player", async () => {
    const room = await table(2);
    expect((await joinRoom(store, room.code, "session-a", "Alice", tick)).players).toHaveLength(2);
  });
  it("rejects outsiders and a fifth player", async () => {
    const room = await table();
    await expect(joinRoom(store, room.code, "outsider", "Eve", tick)).rejects.toThrow(/full/i);
    await expect(readRoom(store, room.code, "outsider", tick)).rejects.toThrow();
  });
  it("handles competing joins for the last seat atomically", async () => {
    const room = await table(3);
    const joins = await Promise.allSettled([
      joinRoom(store, room.code, "four", "Four", tick),
      joinRoom(store, room.code, "five", "Five", tick),
    ]);
    expect(joins.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await readRoom(store, room.code, "session-a", tick)).players).toHaveLength(4);
  });
  it("synchronizes readiness and starts only with a ready connected table", async () => {
    let room = await table(2);
    await expect(action(room, "session-a", { type: "start" })).rejects.toThrow();
    room = await action(room, "session-a", { type: "ready", ready: true });
    expect((await readRoom(store, room.code, "session-b", tick)).players[0].ready).toBe(true);
    room = await action(room, "session-b", { type: "ready", ready: true });
    await expect(action(room, "session-b", { type: "start" })).rejects.toThrow();
    room = await action(room, "session-a", { type: "start" });
    expect(room.phase).toBe("playing");
    expect(room.hand).toHaveLength(7);
    await expect(action(room, "session-a", { type: "start" })).rejects.toThrow();
    await expect(joinRoom(store, room.code, "third", "Third", tick)).rejects.toThrow();
  });
  it("accepts independent readiness updates from the same lobby revision", async () => {
    const room = await table(2);
    const outcomes = await Promise.allSettled(["session-a", "session-b"].map((who) =>
      actOnRoom(store, room.code, who, { expectedRevision: room.revision, actionId: "ready-" + who, action: { type: "ready", ready: true } }, tick)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
    expect((await readRoom(store, room.code, "session-a", tick)).players.every((p) => p.ready)).toBe(true);
  });
  it("returns exactly the viewer's hand and no internal state", async () => {
    const room = await started();
    const alice = await readRoom(store, room.code, "session-a", tick);
    const ben = await readRoom(store, room.code, "session-b", tick);
    expect(alice.hand).toHaveLength(7);
    expect(ben.hand).toHaveLength(7);
    expect(alice.hand.filter((c) => ben.hand.some((b) => b.id === c.id))).toHaveLength(0);
    const wire = JSON.stringify(alice);
    expect(wire).not.toContain("session-a");
    expect(wire).not.toContain("sessionHash");
    expect(wire).not.toContain('"deck":');
    expect(wire).not.toContain('"hands":');
    expect(wire).not.toContain("acceptedActions");
  });
  it("rejects stale actions and makes retried draws idempotent", async () => {
    const room = await started(2), current = await readRoom(store, room.code, "session-a", tick);
    const request = { expectedRevision: current.revision, actionId: "draw-once-only", action: { type: "draw" as const } };
    const next = await actOnRoom(store, room.code, "session-a", request, tick);
    const again = await actOnRoom(store, room.code, "session-a", request, tick);
    expect(again.hand).toEqual(next.hand);
    expect(again.revision).toBe(next.revision);
    await expect(actOnRoom(store, room.code, "session-a", { ...request, actionId: "different-id" }, tick)).rejects.toThrow(/changed|stale|refresh/i);
  });
  it("does not invalidate a legal move when only another player's heartbeat changed", async () => {
    const room = await started(2), before = await readRoom(store, room.code, "session-a", tick);
    tick += 10_001;
    await action(room, "session-b", { type: "heartbeat" });
    const next = await actOnRoom(store, room.code, "session-a", { expectedRevision: before.revision, actionId: "draw-after-presence", action: { type: "draw" } }, tick);
    expect(next.hand).toHaveLength(8);
  });
  it("keeps chat bounded and rejects empty messages", async () => {
    let room = await table(2);
    await expect(action(room, "session-a", { type: "chat", text: " " })).rejects.toThrow();
    for (let i = 0; i < 105; i++) room = await action(room, "session-a", { type: "chat", text: "Message " + i });
    expect(room.chat).toHaveLength(100);
    expect(room.chat.at(-1)?.text).toBe("Message 104");
    expect(room.events.length).toBeLessThanOrEqual(30);
  });
});

describe("presence, departure and rematch", () => {
  it("throttles heartbeats and marks offline after thirty seconds", async () => {
    let room = await table(2);
    const original = room.revision;
    room = await action(room, "session-a", { type: "heartbeat" });
    expect(room.revision).toBe(original);
    tick += 31_000;
    room = await readRoom(store, room.code, "session-a", tick);
    expect(room.players.every((p) => !p.connected)).toBe(true);
    expect(room.players).toHaveLength(2);
    room = await action(room, "session-a", { type: "heartbeat" });
    expect(room.players.find((p) => p.id === room.myId)?.connected).toBe(true);
  });
  it("protects a disconnected seat for sixty seconds after offline, then transfers the host", async () => {
    let room = await table(2);
    tick += 89_000;
    room = await action(room, "session-b", { type: "heartbeat" });
    expect(room.players).toHaveLength(2);
    tick += 2_000;
    room = await readRoom(store, room.code, "session-b", tick);
    expect(room.players).toHaveLength(1);
    expect(room.hostId).toBe(room.myId);
    expect(await store.activeRoom("session-a")).toBeNull();
  });
  it("leaves immediately, awards a forfeit, and resets for a host rematch", async () => {
    let room = await started(2);
    await action(room, "session-b", { type: "leave" });
    room = await readRoom(store, room.code, "session-a", tick);
    expect(room.phase).toBe("finished");
    expect(room.game?.winner).toBe(room.myId);
    expect(room.players[0].wins).toBe(1);
    room = await action(room, "session-a", { type: "rematch" });
    expect(room.phase).toBe("lobby");
    expect(room.players.every((p) => !p.ready)).toBe(true);
    expect(room.players[0].wins).toBe(1);
    expect(room.hand).toEqual([]);
  });
  it("cleans an empty room and frees membership", async () => {
    const room = await createRoom(store, "session-a", "Alice", tick);
    await action(room, "session-a", { type: "leave" });
    expect(await store.read(room.code)).toBeNull();
    expect(await store.activeRoom("session-a")).toBeNull();
  });
  it("retains the winner's name when they leave the results table", async () => {
    const room = await started(3), stored = (await store.read(room.code))!;
    const game = stored.game!, host = stored.players[0];
    game.deck.push(...game.hands[host.id].slice(1));
    game.hands[host.id] = [{ id: game.hands[host.id][0].id, color: "red", value: "5" }];
    game.activeColor = "red"; game.currentPlayerId = host.id;
    const prior = stored.revision; stored.revision++; stored.actionRevision = stored.revision;
    expect(await store.commit(prior, stored)).toBe(true);
    let result = await action(room, "session-a", { type: "play", cardId: game.hands[host.id][0].id });
    expect(result.phase).toBe("finished");
    await action(result, "session-a", { type: "leave" });
    result = await readRoom(store, room.code, "session-b", tick);
    expect(result.game?.winnerName).toBe("Alice");
  });
  it("expires inactive rooms after twenty-four hours", async () => {
    const room = await table(2);
    tick += 86_400_001;
    expect(await store.read(room.code)).toBeNull();
    expect(await store.activeRoom("session-a")).toBeNull();
  });
  it("enforces expiring rate limits", async () => {
    expect(await store.consumeLimit("rate-test", 2, 1)).toBe(true);
    expect(await store.consumeLimit("rate-test", 2, 1)).toBe(true);
    expect(await store.consumeLimit("rate-test", 2, 1)).toBe(false);
    tick += 1001;
    expect(await store.consumeLimit("rate-test", 2, 1)).toBe(true);
  });
  it("never selects memory storage on Vercel", () => {
    const previous = process.env.VERCEL, mode = process.env.UNO_STORE;
    process.env.VERCEL = "1"; process.env.UNO_STORE = "memory";
    try { expect(() => getStore()).toThrow(/Redis|memory/i); }
    finally {
      if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
      if (mode === undefined) delete process.env.UNO_STORE; else process.env.UNO_STORE = mode;
    }
  });
});
