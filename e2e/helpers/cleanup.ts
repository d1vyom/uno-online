import type { BrowserContext } from "@playwright/test";
import type { RoomSnapshot } from "../../src/lib/server/types";
export async function cleanupGuests(contexts: BrowserContext[], code: string | undefined) {
  if (!code || !/^[A-Z2-9]{6}$/.test(code)) return;
  const origin = "http://localhost:3100", path = origin + "/api/rooms/" + code;
  for (const context of contexts) {
    await context.setOffline(false);
    let left = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await context.request.get(path, { timeout: 12_000 });
      if ([401, 403, 404].includes(response.status())) { left = true; break; }
      if (response.status() === 429) { await new Promise((resolve) => setTimeout(resolve, 1000)); continue; }
      if (!response.ok()) throw new Error("Test room cleanup could not read its own seat: " + response.status());
      const room = await response.json() as RoomSnapshot;
      const result = await context.request.post(path + "/actions", {
        headers: { origin }, data: { expectedRevision: room.revision, actionId: crypto.randomUUID(), action: { type: "leave" } }, timeout: 12_000,
      });
      if (result.ok() || [401, 403, 404].includes(result.status())) { left = true; break; }
      if (![409, 429].includes(result.status())) throw new Error("Test room cleanup could not leave its own seat: " + result.status());
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!left) throw new Error("Test room cleanup exhausted its bounded retries.");
  }
}
