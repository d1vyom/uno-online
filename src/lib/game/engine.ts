import { COLORS, GameError, type Card, type GameAction, type GameState } from "./types";

function shuffle(cards: Card[], random: () => number): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(playerIds: string[], random = Math.random): GameState {
  if (playerIds.length < 2 || playerIds.length > 4 || new Set(playerIds).size !== playerIds.length) {
    throw new GameError("A game needs two to four distinct players.");
  }
  const cards: Card[] = [];
  const add = (color: Card["color"], value: Card["value"]) =>
    cards.push({ id: "c" + cards.length, color, value } as Card);
  for (const color of COLORS) {
    add(color, "0");
    for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"] as const) {
      add(color, value); add(color, value);
    }
  }
  for (let i = 0; i < 4; i++) { add("wild", "wild"); add("wild", "draw4"); }
  const deck = shuffle(cards, random);
  const hands = Object.fromEntries(playerIds.map((id) => [id, deck.splice(0, 7)]));
  // Start on a number so the first turn has no hidden action-card exception.
  const openingIndex = deck.findIndex((c) => /^[0-9]$/.test(c.value));
  const opening = deck.splice(openingIndex, 1)[0];
  return {
    playerIds: [...playerIds], hands, deck: shuffle(deck, random), discard: [opening],
    currentPlayerId: playerIds[0], direction: 1, activeColor: opening.color as (typeof COLORS)[number],
    drawnCardId: null, unoIds: [], winner: null,
  };
}

function nextPlayer(state: GameState, steps = 1): string {
  const index = state.playerIds.indexOf(state.currentPlayerId);
  const count = state.playerIds.length;
  return state.playerIds[((index + steps * state.direction) % count + count) % count];
}
function clearUno(state: GameState, id: string) { state.unoIds = state.unoIds.filter((p) => p !== id); }
function draw(state: GameState, id: string, count: number, random: () => number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (!state.deck.length && state.discard.length > 1) {
      const top = state.discard.pop()!;
      state.deck = shuffle(state.discard, random);
      state.discard = [top];
    }
    const card = state.deck.shift();
    if (!card) break;
    state.hands[id].push(card); drawn.push(card);
  }
  clearUno(state, id);
  return drawn;
}

export function canPlay(state: GameState, playerId: string, cardId: string): boolean {
  const card = state.hands[playerId]?.find((c) => c.id === cardId);
  if (!card || state.winner || state.currentPlayerId !== playerId) return false;
  if (state.drawnCardId && state.drawnCardId !== cardId) return false;
  if (card.value === "draw4") return !state.hands[playerId].some((c) => c.color === state.activeColor);
  return card.color === "wild" || card.color === state.activeColor || card.value === state.discard.at(-1)?.value;
}

export function applyGameAction(input: GameState, actorId: string, action: GameAction, random = Math.random): GameState {
  if (input.winner) throw new GameError("This round has finished.");
  if (input.currentPlayerId !== actorId || !input.playerIds.includes(actorId)) throw new GameError("It is not your turn.");
  const state = structuredClone(input), hand = state.hands[actorId];
  if (action.type === "uno") {
    if (hand.length !== 2 || state.unoIds.includes(actorId)) throw new GameError("Declare UNO just before playing from two cards.");
    state.unoIds.push(actorId);
    return state;
  }
  if (action.type === "pass") {
    if (!state.drawnCardId) throw new GameError("You can pass only after a playable draw.");
    state.currentPlayerId = nextPlayer(state); state.drawnCardId = null;
    return state;
  }
  if (action.type === "draw") {
    if (state.drawnCardId) throw new GameError("You have already drawn. Play the drawn card or pass.");
    const drawn = draw(state, actorId, 1, random)[0];
    if (drawn && canPlay(state, actorId, drawn.id)) state.drawnCardId = drawn.id;
    else state.currentPlayerId = nextPlayer(state);
    return state;
  }
  if (!canPlay(state, actorId, action.cardId)) throw new GameError("That card cannot be played now.");
  const card = hand.find((c) => c.id === action.cardId)!;
  if (card.color === "wild" && !COLORS.includes(action.color!)) throw new GameError("Choose red, blue, green, or yellow.");
  hand.splice(hand.indexOf(card), 1);
  state.discard.push(card);
  state.activeColor = card.color === "wild" ? action.color! : card.color;
  state.drawnCardId = null;
  if (hand.length === 1) {
    if (action.uno || state.unoIds.includes(actorId)) {
      if (!state.unoIds.includes(actorId)) state.unoIds.push(actorId);
    } else draw(state, actorId, 2, random);
  } else clearUno(state, actorId);
  let steps = 1;
  if (card.value === "reverse") { state.direction = state.direction === 1 ? -1 : 1; if (state.playerIds.length === 2) steps = 2; }
  if (card.value === "skip") steps = 2;
  if (card.value === "draw2" || card.value === "draw4") {
    draw(state, nextPlayer(state), card.value === "draw2" ? 2 : 4, random);
    steps = 2;
  }
  if (!hand.length) state.winner = actorId;
  state.currentPlayerId = nextPlayer(state, steps);
  return state;
}

export function removeGamePlayer(input: GameState, playerId: string, random = Math.random): GameState {
  const state = structuredClone(input);
  if (!state.playerIds.includes(playerId)) return state;
  const next = nextPlayer(state);
  state.deck = shuffle([...state.deck, ...state.hands[playerId]], random);
  delete state.hands[playerId];
  clearUno(state, playerId);
  state.playerIds = state.playerIds.filter((p) => p !== playerId);
  if (state.currentPlayerId === playerId) { state.currentPlayerId = state.playerIds.includes(next) ? next : state.playerIds[0] ?? ""; state.drawnCardId = null; }
  if (state.playerIds.length < 2 && !state.winner) state.winner = state.playerIds[0] ?? null;
  return state;
}
