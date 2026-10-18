import { createRoom } from "@/lib/server/rooms";
import { boundary, creationStore, guest, json, nameSchema, payload } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return boundary(async () => {
    const { name } = await payload(request, nameSchema);
    const identity = guest(request, true), store = await creationStore(request);
    return json(await createRoom(store, identity.hash, name), 201, identity.cookie);
  });
}
