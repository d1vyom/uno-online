import { beforeAll, describe, expect, it } from "vitest";
import { POST as create } from "@/app/api/rooms/route";
import { GET as read } from "@/app/api/rooms/[code]/route";
import { POST as join } from "@/app/api/rooms/[code]/join/route";
import { POST as act } from "@/app/api/rooms/[code]/actions/route";
import type { RoomSnapshot } from "@/lib/server/types";

beforeAll(() => { process.env.UNO_STORE = "memory"; });
const origin = "http://localhost:3000";
function post(path: string, body: unknown, cookie = "", customOrigin = origin) {
  return new Request(origin + path, { method: "POST", headers: { origin: customOrigin, "content-type": "application/json", cookie }, body: JSON.stringify(body) });
}
function ctx(code: string) { return { params: Promise.resolve({ code }) }; }
async function newRoom(name = "Alice") {
  const response = await create(post("/api/rooms", { name }));
  return { response, room: await response.json() as RoomSnapshot, cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
describe("HTTP boundary", () => {
  it("creates a private guest cookie and returns uncached sanitized state", async () => {
    const { response, room, cookie } = await newRoom();
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(cookie).toMatch(/^uno_session=[a-f0-9]{64}$/);
    expect(room.players).toHaveLength(1);
    expect(JSON.stringify(room)).not.toContain("sessionHash");
  });
  it("rejects foreign origins before creating rooms", async () => {
    expect((await create(post("/api/rooms", { name: "Eve" }, "", "https://evil.example"))).status).toBe(403);
  });
  it("rejects malformed and oversized payloads", async () => {
    const malformed = new Request(origin + "/api/rooms", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" });
    expect((await create(malformed)).status).toBe(400);
    expect((await create(post("/api/rooms", { name: "x".repeat(9000) }))).status).toBe(413);
    expect((await create(post("/api/rooms", { name: "" }))).status).toBe(400);
  });
  it("GET never creates a session or seat", async () => {
    const { room } = await newRoom("Reader");
    const response = await read(new Request(origin + "/api/rooms/" + room.code), ctx(room.code));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("a copied public player ID cannot impersonate a session", async () => {
    const { room } = await newRoom("Private");
    const response = await read(new Request(origin + "/api/rooms/" + room.code, { headers: { cookie: "uno_session=" + room.myId } }), ctx(room.code));
    expect(response.status).toBe(401);
    const guessed = await read(new Request(origin + "/api/rooms/" + room.code, { headers: { cookie: "uno_session=" + "a".repeat(64) } }), ctx(room.code));
    expect(guessed.status).toBe(403);
  });
  it("enforces strict action schemas, forbids actor spoofing and rejects stale writes", async () => {
    const { room, cookie } = await newRoom("Actor"), path = "/api/rooms/" + room.code + "/actions";
    const action = { expectedRevision: room.revision, actionId: crypto.randomUUID(), action: { type: "ready", ready: true } };
    expect((await act(post(path, { ...action, actorId: room.myId }, cookie), ctx(room.code))).status).toBe(400);
    expect((await act(post(path, action, cookie), ctx(room.code))).status).toBe(200);
    expect((await act(post(path, { ...action, actionId: crypto.randomUUID(), action: { type: "start" } }, cookie), ctx(room.code))).status).toBe(409);
    expect((await act(post(path, { ...action, action: { type: "play", cardId: "c5", color: "purple" } }, cookie), ctx(room.code))).status).toBe(400);
  });
  it("joins with a fresh session and keeps the existing guest cookie stable", async () => {
    const { room, cookie } = await newRoom("Host"), path = "/api/rooms/" + room.code + "/join";
    const guest = await join(post(path, { name: "Guest" }), ctx(room.code));
    expect(guest.status).toBe(200);
    const again = await join(post(path, { name: "Host" }, cookie), ctx(room.code));
    expect(again.headers.get("set-cookie")).toBeNull();
    expect((await again.json()).players).toHaveLength(2);
  });
  it("returns a draw once when its first HTTP response is lost and retried", async () => {
    const { room, cookie } = await newRoom("Retry host"), path = "/api/rooms/" + room.code + "/actions";
    const guestResponse = await join(post("/api/rooms/" + room.code + "/join", { name: "Retry guest" }), ctx(room.code));
    const guestCookie = guestResponse.headers.get("set-cookie")!.split(";")[0];
    let view = await guestResponse.json() as RoomSnapshot;
    for (const who of [cookie, guestCookie]) {
      const response = await act(post(path, { expectedRevision: view.revision, actionId: crypto.randomUUID(), action: { type: "ready", ready: true } }, who), ctx(room.code));
      view = await response.json();
    }
    const start = await act(post(path, { expectedRevision: view.revision, actionId: crypto.randomUUID(), action: { type: "start" } }, cookie), ctx(room.code));
    view = await start.json();
    const envelope = { expectedRevision: view.revision, actionId: crypto.randomUUID(), action: { type: "draw" } };
    await act(post(path, envelope, cookie), ctx(room.code)); // The caller never consumes this response.
    const replay = await act(post(path, envelope, cookie), ctx(room.code));
    expect(replay.status).toBe(200);
    expect((await replay.json()).hand).toHaveLength(8);
  });
});
