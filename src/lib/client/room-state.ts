import type { RoomSnapshot } from "../server/types";
export function acceptSnapshot(current: RoomSnapshot | null, incoming: RoomSnapshot): RoomSnapshot {
  return current && current.code === incoming.code && current.revision > incoming.revision ? current : incoming;
}
