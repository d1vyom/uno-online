import { actOnRoom } from "@/lib/server/rooms";
import { getStore } from "@/lib/server/store";
import { actionSchema, boundary, guest, json, limit, payload, type RouteContext } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: RouteContext) {
  return boundary(async () => {
    const action = await payload(request, actionSchema);
    const identity = guest(request), store = getStore(), { code } = await context.params;
    await limit(store, "actions:" + identity.hash, 30, 10);
    return json(await actOnRoom(store, code, identity.hash, action));
  });
}
