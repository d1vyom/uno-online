import { afterEach, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";
import { createRedisStore } from "@/lib/server/redis-store";
afterEach(() => vi.unstubAllGlobals());
it("normalizes a numeric room code after the real SDK deserializes an EVAL result", async () => {
  // The SDK requests base64-encoded Redis bulk strings at the REST boundary.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ result: Buffer.from("234567").toString("base64") }), { headers: { "content-type": "application/json" } }));
  const redis = new Redis({ url: "https://test-redis.upstash.io", token: "test-token", enableAutoPipelining: false });
  const store = createRedisStore(redis, "contract:");
  expect(await store.activeRoom("guest-hash")).toBe("234567");
});
