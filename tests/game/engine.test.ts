import { describe, expect, it } from "vitest";
import { createGame } from "@/lib/game/engine";

describe("game creation", () => {
  it("creates a conserved 108-card four-player game", () => {
    const game = createGame(["a", "b", "c", "d"], () => 0.42);
    expect(Object.values(game.hands).map((hand) => hand.length)).toEqual([7, 7, 7, 7]);
    expect(game.discard).toHaveLength(1);
    expect(game.discard[0].value).toMatch(/^[0-9]$/);
    const cards = [...game.deck, ...game.discard, ...Object.values(game.hands).flat()];
    expect(cards).toHaveLength(108);
    expect(new Set(cards.map((card) => card.id)).size).toBe(108);
    expect(game.currentPlayerId).toBe("a");
  });
});
