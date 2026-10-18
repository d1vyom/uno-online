import { z } from "zod";
import { getStore } from "./store";
import { hashSessionToken, newSessionToken, readSession, sessionCookie } from "./session";
import { ServiceError, type RoomStore } from "./types";
export const nameSchema = z.object({ name: z.string().trim().min(1).max(24).regex(/^\P{Cc}+$/u) }).strict();
export const actionSchema = z.object({
  actionId: z.string().min(8).max(100),
  expectedRevision: z.number().int().min(0),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("play"), cardId: z.string().min(1).max(80), color: z.enum(["red", "blue", "green", "yellow"]).optional(), uno: z.boolean().optional() }).strict(),
    z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
    z.object({ type: z.literal("chat"), text: z.string().trim().min(1).max(200) }).strict(),
    ...(["draw", "pass", "uno", "start", "leave", "rematch", "heartbeat"] as const).map((type) => z.object({ type: z.literal(type) }).strict()),
  ]),
}).strict();
export type RouteContext = { params: Promise<{ code: string }> };
export function json(value: unknown, status = 200, cookie?: string): Response {
  return Response.json(value, {
    status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie",
      ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
}
export async function boundary(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); }
  catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Check your name, room code, or action and try again." }, 400);
    if (error instanceof ServiceError) {
      const response = json({ error: error.message }, error.status);
      if (error.status === 429) response.headers.set("Retry-After", "10");
      return response;
    }
    console.error("[uno] Request failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "The multiplayer service is temporarily unavailable. Please retry." }, 503);
  }
}
export async function payload<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ServiceError("This action must come from this site.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ServiceError("Send JSON for this action.");
  const reader = request.body?.getReader();
  let bytes = 0, text = "";
  if (!reader) throw new ServiceError("A request body is required.");
  const decoder = new TextDecoder();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 8192) { await reader.cancel(); throw new ServiceError("This request is too large.", 413); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ServiceError("This request contains invalid JSON."); }
  return schema.parse(data);
}
export function guest(request: Request, allowNew = false) {
  const existing = readSession(request);
  if (!existing && !allowNew) throw new ServiceError("Join a room to begin.", 401);
  const token = existing ?? newSessionToken();
  return { hash: hashSessionToken(token), cookie: existing ? undefined : sessionCookie(token) };
}
export async function limit(store: RoomStore, key: string, maximum: number, seconds: number) {
  if (!await store.consumeLimit(key, maximum, seconds)) throw new ServiceError("A little too fast. Wait a moment and try again.", 429);
}
export async function creationStore(request: Request): Promise<RoomStore> {
  const store = getStore();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  await limit(store, "create:" + hashSessionToken(ip), 20, 600);
  return store;
}
