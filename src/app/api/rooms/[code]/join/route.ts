import { joinRoom } from "@/lib/server/rooms";
import { getStore } from "@/lib/server/store";
import { boundary, guest, json, limit, nameSchema, payload, type RouteContext } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: RouteContext) {
  return boundary(async () => {
    const { name } = await payload(request, nameSchema);
    const identity = guest(request, true), store = getStore(), { code } = await context.params;
    // Bound anonymous probes by IP as well as by cookie: an attacker can discard guest cookies.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await limit(store, "join-ip:" + ip.slice(0, 80), 60, 60);
    await limit(store, "join:" + identity.hash, 20, 60);
    return json(await joinRoom(store, code, identity.hash, name), 200, identity.cookie);
  });
}
