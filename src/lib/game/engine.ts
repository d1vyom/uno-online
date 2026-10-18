import type { GameAction, GameState } from "./types";
export function createGame(_playerIds: string[], _random?: () => number): GameState { throw new Error("Game creation not implemented"); }
export function applyGameAction(_state: GameState, _actorId: string, _action: GameAction, _random?: () => number): GameState { throw new Error("Game actions not implemented"); }
export function removeGamePlayer(_state: GameState, _playerId: string, _random?: () => number): GameState { throw new Error("Departures not implemented"); }
export function canPlay(_state: GameState, _playerId: string, _cardId: string): boolean { return false; }
