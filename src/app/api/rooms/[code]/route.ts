import { readRoom } from "@/lib/server/rooms";
import { getStore } from "@/lib/server/store";
import { boundary, guest, json, limit, type RouteContext } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: RouteContext) {
  return boundary(async () => {
    const identity = guest(request), store = getStore(), { code } = await context.params;
    await limit(store, "read:" + identity.hash, 40, 10);
    return json(await readRoom(store, code, identity.hash));
  });
}
