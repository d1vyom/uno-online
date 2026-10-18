import { expect, it } from "vitest";
import { acceptSnapshot } from "@/lib/client/room-state";
import type { RoomSnapshot } from "@/lib/server/types";
it("does not replace an accepted move with a delayed older snapshot", () => {
  const current = { code: "ABC234", revision: 12 } as RoomSnapshot;
  const delayed = { code: "ABC234", revision: 11 } as RoomSnapshot;
  expect(acceptSnapshot(current, delayed).revision).toBe(12);
});
it("accepts a newer snapshot and a new room", () => {
  const current = { code: "ABC234", revision: 12 } as RoomSnapshot;
  expect(acceptSnapshot(current, { code: "ABC234", revision: 13 } as RoomSnapshot).revision).toBe(13);
  expect(acceptSnapshot(current, { code: "DEF567", revision: 0 } as RoomSnapshot).code).toBe("DEF567");
});
