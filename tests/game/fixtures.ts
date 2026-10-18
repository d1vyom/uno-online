import type { Card, GameState } from "@/lib/game/types";

let serial = 0;
export function card(color: Card["color"] = "red", value: Card["value"] = "5"): Card {
  return { id: "fixture-" + serial++, color, value } as Card;
}
export function fixture(overrides: Partial<GameState> = {}): GameState {
  return {
    playerIds: ["a", "b", "c", "d"],
    hands: {
      a: [card("red", "3"), card("blue", "2"), card("yellow", "4")],
      b: [card("green", "4"), card("yellow", "8"), card("blue", "9")],
      c: [card("green", "2")],
      d: [card("yellow", "7")],
    },
    deck: Array.from({ length: 12 }, () => card("red", "7")),
    discard: [card("red", "5")],
    currentPlayerId: "a", direction: 1, activeColor: "red",
    drawnCardId: null, unoIds: [], winner: null,
    ...overrides,
  };
}
