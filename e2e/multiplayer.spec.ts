import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { RoomSnapshot } from "../src/lib/server/types";

test("four friends play a complete round, refresh, chat, and rematch", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const contexts: BrowserContext[] = [], pages: Page[] = [];
  const errors: string[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
    }
    const host = pages[0];
    await host.goto("/");
    await host.getByLabel("Your name").fill("Alice");
    await host.getByRole("button", { name: "Create a room" }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z2-9]{6}$/);
    const code = host.url().split("/").at(-1)!;
    for (let i = 1; i < 5; i++) {
      await pages[i].goto("/room/" + code);
      await pages[i].getByLabel("Your name").fill(["Alice", "Ben", "Cleo", "Dev", "Eve"][i]);
      await pages[i].getByRole("button", { name: "Join the room", exact: true }).click();
      if (i < 4) await expect(pages[i].getByRole("button", { name: "Ready up", exact: true })).toBeVisible();
      else await expect(pages[i].getByRole("alert").filter({ hasText: /full/i })).toBeVisible();
    }
    await host.screenshot({ path: testInfo.outputPath("lobby-desktop.png"), fullPage: true });
    for (let i = 0; i < 4; i++) {
      await pages[i].getByRole("button", { name: "Ready up", exact: true }).click();
      await expect(pages[i].getByRole("button", { name: "Not ready", exact: true })).toBeVisible();
    }
    await expect(host.getByRole("button", { name: "Start the game" })).toBeEnabled();
    await host.getByRole("button", { name: "Start the game" }).click();
    for (let i = 0; i < 4; i++) await expect(pages[i].getByTestId("hand-card")).toHaveCount(7);

    async function snapshot(context: BrowserContext): Promise<RoomSnapshot> {
      const response = await context.request.get("http://localhost:3100/api/rooms/" + code);
      expect(response.status()).toBe(200); return response.json();
    }
    const initial = await Promise.all(contexts.slice(0, 4).map(snapshot));
    expect(new Set(initial.flatMap((s) => s.hand.map((c) => c.id))).size).toBe(28);
    expect(new Set(initial.map((s) => s.game?.topCard.id)).size).toBe(1);
    const byId = new Map(initial.map((s, i) => [s.myId, i]));
    await host.screenshot({ path: testInfo.outputPath("table-desktop.png"), fullPage: true });
    await pages[1].setViewportSize({ width: 360, height: 800 });
    await pages[1].screenshot({ path: testInfo.outputPath("table-mobile.png"), fullPage: true });
    expect(await pages[1].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page: host }).analyze();
    expect(accessibility.violations).toEqual([]);
    await pages[2].reload();
    await expect(pages[2].getByTestId("hand-card")).toHaveCount(7);
    await pages[1].getByRole("textbox", { name: "Chat message", exact: true }).fill("Good luck, everyone!");
    await pages[1].getByRole("button", { name: "Send message" }).click();
    await expect(host.getByRole("log")).toContainText("Good luck, everyone!");

    let latest = await snapshot(contexts[0]), turns = 0, wilds = 0;
    while (latest.phase === "playing" && turns < 400) {
      const index = byId.get(latest.game!.currentPlayerId)!;
      const page = pages[index], state = await snapshot(contexts[index]);
      const legal = state.hand.filter((c) => state.legalCardIds.includes(c.id));
      if (legal.length) {
        const chosen = legal.find((c) => c.color === "wild") ?? legal[0];
        if (state.hand.length === 2 && !state.players.find((p) => p.id === state.myId)?.uno) {
          await page.getByLabel("Declare UNO with my next card").check();
        }
        const play = page.locator('[data-testid="hand-card"][data-card-id="' + chosen.id + '"]');
        await expect(play).toBeEnabled(); await play.click();
        if (chosen.color === "wild") {
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.getByRole("button", { name: "Choose blue", exact: true }).click(); wilds++;
        }
      } else if (state.game?.canPass) await page.getByRole("button", { name: "Pass this turn" }).click();
      else await page.getByRole("button", { name: "Draw a card" }).click();
      const signature = (view: RoomSnapshot) => JSON.stringify([view.hand.map((c) => c.id), view.game?.topCard.id, view.game?.currentPlayerId, view.game?.canPass, view.game?.winner]);
      await expect.poll(async () => signature(await snapshot(contexts[index]))).not.toBe(signature(state));
      latest = await snapshot(contexts[0]); turns++;
    }
    expect(latest.phase).toBe("finished");
    expect(turns).toBeGreaterThan(5);
    await testInfo.attach("round-statistics", { body: JSON.stringify({ turns, wilds }), contentType: "application/json" });
    for (let i = 0; i < 4; i++) await expect(pages[i].getByRole("heading", { name: /takes it|your win/ })).toBeVisible();
    await host.getByRole("button", { name: "One more round" }).click();
    for (let i = 0; i < 4; i++) await expect(pages[i].getByRole("button", { name: "Ready up", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});
