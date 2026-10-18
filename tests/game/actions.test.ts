import { describe, expect, it } from "vitest";
import { applyGameAction as act, canPlay, createGame, removeGamePlayer } from "@/lib/game/engine";
import { card, fixture } from "./fixtures";

describe("rules and trust boundaries", () => {
  it.each([[], ["a"], ["a", "a"], ["a", "b", "c", "d", "e"]])("rejects invalid seats %j", (...ids) => {
    expect(() => createGame(ids as string[])).toThrow();
  });
  it("plays a matching color immutably", () => {
    const game = fixture(), original = structuredClone(game);
    const next = act(game, "a", { type: "play", cardId: game.hands.a[0].id });
    expect(next.currentPlayerId).toBe("b");
    expect(next.hands.a).toHaveLength(2);
    expect(next.discard.at(-1)?.value).toBe("3");
    expect(game).toEqual(original);
  });
  it("accepts matching values in another color", () => {
    const match = card("blue", "5");
    const game = fixture(); game.hands.a.push(match);
    expect(canPlay(game, "a", match.id)).toBe(true);
    expect(act(game, "a", { type: "play", cardId: match.id }).activeColor).toBe("blue");
  });
  it("rejects unmatched cards, unknown cards and out-of-turn actors without mutation", () => {
    const game = fixture(), original = structuredClone(game);
    expect(canPlay(game, "a", game.hands.a[1].id)).toBe(false);
    expect(() => act(game, "a", { type: "play", cardId: game.hands.a[1].id })).toThrow();
    expect(() => act(game, "a", { type: "play", cardId: game.hands.b[0].id })).toThrow();
    expect(() => act(game, "b", { type: "draw" })).toThrow();
    expect(game).toEqual(original);
  });
  it("requires a real chosen color for wilds", () => {
    const game = fixture(); const wild = card("wild", "wild"); game.hands.a.push(wild);
    expect(() => act(game, "a", { type: "play", cardId: wild.id })).toThrow();
    expect(() => act(game, "a", { type: "play", cardId: wild.id, color: "purple" as "red" })).toThrow();
    expect(act(game, "a", { type: "play", cardId: wild.id, color: "green" }).activeColor).toBe("green");
  });
  it("restricts draw four while holding the active color", () => {
    const game = fixture(); const wild = card("wild", "draw4"); game.hands.a.push(wild);
    expect(canPlay(game, "a", wild.id)).toBe(false);
    expect(() => act(game, "a", { type: "play", cardId: wild.id, color: "blue" })).toThrow();
  });
  it.each([["skip", "c", 1, 0], ["reverse", "d", -1, 0], ["draw2", "c", 1, 2]] as const)(
    "resolves %s", (value, nextId, direction, drawn) => {
      const game = fixture(); const action = card("red", value); game.hands.a.push(action);
      const next = act(game, "a", { type: "play", cardId: action.id });
      expect(next.currentPlayerId).toBe(nextId);
      expect(next.direction).toBe(direction);
      expect(next.hands.b.length - game.hands.b.length).toBe(drawn);
    });
  it("treats reverse as skip with two players", () => {
    const game = fixture({ playerIds: ["a", "b"] });
    game.hands.a.push(card("red", "reverse"));
    const next = act(game, "a", { type: "play", cardId: game.hands.a.at(-1)!.id });
    expect(next.currentPlayerId).toBe("a");
  });
  it("applies final-card draw-four penalty before ending", () => {
    const wild = card("wild", "draw4"), game = fixture();
    game.hands.a = [wild];
    const next = act(game, "a", { type: "play", cardId: wild.id, color: "blue" });
    expect(next.hands.b).toHaveLength(7);
    expect(next.winner).toBe("a");
  });
});

describe("draw phases, UNO and recycling", () => {
  it("holds a playable draw for play or pass and rejects a second draw", () => {
    const game = fixture();
    const drawn = act(game, "a", { type: "draw" });
    expect(drawn.currentPlayerId).toBe("a");
    expect(drawn.hands.a).toHaveLength(4);
    expect(drawn.drawnCardId).toBe(game.deck[0].id);
    expect(() => act(drawn, "a", { type: "draw" })).toThrow();
    expect(() => act(drawn, "a", { type: "play", cardId: game.hands.a[0].id })).toThrow();
    expect(act(drawn, "a", { type: "pass" }).currentPlayerId).toBe("b");
    expect(act(drawn, "a", { type: "play", cardId: drawn.drawnCardId! }).hands.a).toHaveLength(3);
  });
  it("advances automatically after an unplayable draw", () => {
    const game = fixture({ deck: [card("blue", "9")] });
    expect(act(game, "a", { type: "draw" }).currentPlayerId).toBe("b");
    expect(() => act(game, "a", { type: "pass" })).toThrow();
  });
  it("penalizes undeclared one-card hands", () => {
    const game = fixture(); game.hands.a = [card("red", "2"), card("blue", "1")];
    expect(act(game, "a", { type: "play", cardId: game.hands.a[0].id }).hands.a).toHaveLength(3);
  });
  it("supports armed and atomic UNO declarations", () => {
    const game = fixture(); game.hands.a = [card("red", "2"), card("blue", "1")];
    const armed = act(game, "a", { type: "uno" });
    expect(act(armed, "a", { type: "play", cardId: game.hands.a[0].id }).hands.a).toHaveLength(1);
    expect(act(game, "a", { type: "play", cardId: game.hands.a[0].id, uno: true }).unoIds).toContain("a");
    expect(() => act(fixture(), "a", { type: "uno" })).toThrow();
  });
  it("clears UNO when drawing", () => {
    const game = fixture({ unoIds: ["a"] });
    expect(act(game, "a", { type: "draw" }).unoIds).not.toContain("a");
  });
  it("recycles the discard while retaining its top card", () => {
    const top = card("red", "5"), game = fixture({ deck: [], discard: [card("green", "3"), top] });
    const next = act(game, "a", { type: "draw" });
    expect(next.discard).toEqual([top]);
    expect(next.hands.a).toHaveLength(4);
  });
  it("passes a truly exhausted draw without fabricating a card", () => {
    const game = fixture({ deck: [] }), next = act(game, "a", { type: "draw" });
    expect(next.currentPlayerId).toBe("b");
    expect(next.hands.a).toHaveLength(3);
  });
  it("rejects changes to a finished game", () => {
    expect(() => act(fixture({ winner: "a" }), "a", { type: "draw" })).toThrow();
  });
});

describe("departures", () => {
  it("preserves the next player when the current player leaves in reverse", () => {
    const game = fixture({ direction: -1, currentPlayerId: "b" });
    const next = removeGamePlayer(game, "b");
    expect(next.currentPlayerId).toBe("a");
    expect(next.playerIds).toEqual(["a", "c", "d"]);
    expect(next.deck.length).toBe(game.deck.length + 3);
    expect(next.hands.b).toBeUndefined();
  });
  it("does not skip a current player when someone else leaves", () => {
    expect(removeGamePlayer(fixture({ currentPlayerId: "c" }), "a").currentPlayerId).toBe("c");
  });
  it("awards a forfeit win to the last player", () => {
    expect(removeGamePlayer(fixture({ playerIds: ["a", "b"] }), "a").winner).toBe("b");
  });
});
