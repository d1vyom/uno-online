import { expect, test } from "@playwright/test";
import { cleanupGuests } from "./helpers/cleanup";

test("a delayed background heartbeat does not discard a guest's readiness click", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let intercepted = false;
  await page.route("**/api/rooms/*/actions", async (route) => {
    if (route.request().postDataJSON()?.action?.type === "heartbeat") { intercepted = true; await held; }
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/"); await page.getByLabel("Your name").fill("Heartbeat");
    await page.getByRole("button", { name: "Create a room" }).click();
    await expect.poll(() => intercepted).toBe(true);
    await page.getByRole("button", { name: "Ready up", exact: true }).click();
    await expect(page.getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await cleanupGuests([page.context()], page.url().split("/").at(-1)); }
});

test("a hanging snapshot times out and the same private seat recovers", async ({ page }) => {
  test.setTimeout(45_000);
  let release!: () => void, intercepted = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/rooms/*", async (route) => {
    if (route.request().method() === "GET" && !intercepted) { intercepted = true; await held; }
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/"); await page.getByLabel("Your name").fill("Recovery");
    await page.getByRole("button", { name: "Create a room" }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole("heading", { name: "The table is out of reach." })).toBeVisible({ timeout: 16_000 });
    release();
    await expect(page.getByRole("button", { name: "Ready up", exact: true })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await cleanupGuests([page.context()], page.url().split("/").at(-1)); }
});

test("refresh and network recovery keep a private seat, then host departure transfers ownership", async ({ browser }) => {
  const hostContext = await browser.newContext(), guestContext = await browser.newContext();
  let ownedCode: string | undefined;
  try {
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await host.goto("/"); await host.getByLabel("Your name").fill("Host");
    await host.getByRole("button", { name: "Create a room" }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const url = host.url();
    ownedCode = url.split("/").at(-1);
    await guest.goto(url); await guest.getByLabel("Your name").fill("Guest");
    await guest.getByRole("button", { name: "Join the room", exact: true }).click();
    await expect(guest.getByRole("button", { name: "Ready up", exact: true })).toBeVisible();
    await guestContext.setOffline(true);
    await expect(guest.getByText("Reconnecting…", { exact: true })).toBeVisible();
    await guestContext.setOffline(false);
    await expect(guest.getByText("At the table", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole("button", { name: "Ready up", exact: true })).toBeVisible();
    await host.getByRole("button", { name: "Leave room" }).click();
    await expect(host).toHaveURL("/");
    await expect(guest.getByRole("button", { name: "Start the game" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Start the game" })).toBeDisabled();
  } finally {
    try { await cleanupGuests([hostContext, guestContext], ownedCode); }
    finally { await hostContext.close(); await guestContext.close(); }
  }
});
