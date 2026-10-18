import { afterAll, describe, expect, it } from "vitest";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { createRedisStore } from "@/lib/server/redis-store";
import { actOnRoom, createRoom, joinRoom, readRoom } from "@/lib/server/rooms";

const configured = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
describe.skipIf(!configured)("managed Redis integration (requires test credentials)", () => {
  const namespace = "uno-test:" + randomUUID() + ":";
  let redis: Redis;
  function setup() {
    redis ??= new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
    return createRedisStore(redis, namespace);
  }
  afterAll(async () => {
    if (!redis) return;
    const keys = await redis.keys(namespace + "*");
    if (keys.length) await redis.del(...keys);
  });
  it("shares state across independent adapters and rejects a fifth-player race", async () => {
    const store = setup(), other = setup();
    let room = await createRoom(store, "a", "Alice");
    room = await joinRoom(other, room.code, "b", "Ben");
    room = await joinRoom(store, room.code, "c", "Cleo");
    const joins = await Promise.allSettled([joinRoom(store, room.code, "d", "Dev"), joinRoom(other, room.code, "e", "Eve")]);
    expect(joins.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await readRoom(other, room.code, "a")).players).toHaveLength(4);
  });
  it("commits only one action at the same revision and keeps draw retries safe", async () => {
    const store = setup(), session = "host-" + randomUUID(), guest = "guest-" + randomUUID();
    let room = await createRoom(store, session, "Host");
    room = await joinRoom(store, room.code, guest, "Guest");
    for (const who of [session, guest]) {
      room = await actOnRoom(store, room.code, who, { actionId: randomUUID(), expectedRevision: room.revision, action: { type: "ready", ready: true } });
    }
    room = await actOnRoom(store, room.code, session, { actionId: randomUUID(), expectedRevision: room.revision, action: { type: "start" } });
    const request = { actionId: randomUUID(), expectedRevision: room.revision, action: { type: "draw" as const } };
    const outcomes = await Promise.allSettled([
      actOnRoom(store, room.code, session, request),
      actOnRoom(store, room.code, session, { ...request, actionId: randomUUID() }),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const latest = await readRoom(store, room.code, session);
    expect(latest.hand).toHaveLength(8);
    const accepted = outcomes[0].status === "fulfilled";
    if (accepted) expect((await actOnRoom(store, room.code, session, request)).hand).toEqual(latest.hand);
    expect(await redis.ttl(namespace + "room:" + room.code)).toBeGreaterThan(86390);
    await redis.expire(namespace + "room:" + room.code, 0);
    expect(await store.activeRoom(session)).toBeNull();
  });
});
