import { expect, test } from "@playwright/test";

test("refresh and network recovery keep a private seat, then host departure transfers ownership", async ({ browser }) => {
  const hostContext = await browser.newContext(), guestContext = await browser.newContext();
  try {
    const host = await hostContext.newPage(), guest = await guestContext.newPage();
    await host.goto("/"); await host.getByLabel("Your name").fill("Host");
    await host.getByRole("button", { name: "Create a room" }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const url = host.url();
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
  } finally { await hostContext.close(); await guestContext.close(); }
});
