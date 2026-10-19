import { e2eTarget } from "./helpers/target";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupGuests } from "./helpers/cleanup";

test("a guest creates a named room and readiness survives refresh", async ({ page }, testInfo) => {
  let ownedCode: string | undefined;
  try {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good friends. Great rivalries." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await page.getByLabel("Your name").fill("Alice");
  await page.getByRole("button", { name: "Create a room" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
  ownedCode = page.url().split("/").at(-1);
  await expect(page.getByRole("heading", { name: "Your table is waiting." })).toBeVisible();
  await expect(page.getByText("Alice", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Ready up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the game" })).toBeDisabled();
  await page.getByRole("button", { name: "Leave room" }).click();
  await expect(page).toHaveURL("/");
  } finally { await cleanupGuests([page.context()], ownedCode); }
});

test("mobile landing is accessible and rules dialog restores focus", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "How to play", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("missing rooms and invalid names have recoverable errors", async ({ page, request }) => {
  // Create and close our own room instead of assuming a public code is unused.
  const origin = e2eTarget().baseURL;
  const created = await request.post("/api/rooms", { headers: { origin }, data: { name: "Closed table" } });
  expect(created.status()).toBe(201);
  const room = await created.json();
  const closed = await request.post("/api/rooms/" + room.code + "/actions", { headers: { origin },
    data: { expectedRevision: room.revision, actionId: crypto.randomUUID(), action: { type: "leave" } } });
  expect(closed.status()).toBe(200);
  await page.goto("/room/" + room.code);
  await expect(page.getByRole("heading", { name: "Join this table." })).toBeVisible();
  await page.getByLabel("Your name").fill("Guest");
  await page.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /exist|expired/i })).toBeVisible();
  await page.getByRole("link", { name: "Back home" }).click();
  await expect(page).toHaveURL("/");
});
