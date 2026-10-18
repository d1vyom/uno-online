export const COLORS = ["red", "blue", "green", "yellow"] as const;
export type Color = (typeof COLORS)[number];
export type NumberValue = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type Card =
  | { id: string; color: Color; value: NumberValue | "skip" | "reverse" | "draw2" }
  | { id: string; color: "wild"; value: "wild" | "draw4" };
export interface GameState {
  playerIds: string[];
  hands: Record<string, Card[]>;
  deck: Card[];
  discard: Card[];
  currentPlayerId: string;
  direction: 1 | -1;
  activeColor: Color;
  drawnCardId: string | null;
  unoIds: string[];
  winner: string | null;
}
export type GameAction =
  | { type: "play"; cardId: string; color?: Color; uno?: boolean }
  | { type: "draw" } | { type: "pass" } | { type: "uno" };
export class GameError extends Error {}
