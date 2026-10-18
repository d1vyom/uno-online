import type { Card, Color, GameAction, GameState } from "../game/types";
export class ServiceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface RoomPlayer {
  id: string; sessionHash: string; name: string; ready: boolean; lastSeen: number; wins: number;
}
export type RoomAction = GameAction
  | { type: "ready"; ready: boolean }
  | { type: "start" } | { type: "leave" } | { type: "rematch" } | { type: "heartbeat" }
  | { type: "chat"; text: string };
export interface ActionRequest { actionId: string; expectedRevision: number; action: RoomAction }
export interface ChatMessage { id: string; playerId: string; name: string; text: string; time: number }
export interface RoomEvent { id: string; text: string; time: number }
export interface Room {
  schemaVersion: 1; code: string; revision: number; hostId: string;
  phase: "lobby" | "playing" | "finished"; players: RoomPlayer[];
  game: GameState | null; chat: ChatMessage[]; events: RoomEvent[];
  acceptedActions: { sessionHash: string; actionId: string }[];
  storageMode: "redis" | "memory";
}
export interface RoomSnapshot {
  code: string; revision: number; hostId: string; myId: string; phase: Room["phase"];
  players: { id: string; name: string; ready: boolean; connected: boolean; cardCount: number; uno: boolean; wins: number }[];
  hand: Card[]; legalCardIds: string[];
  game: { topCard: Card; activeColor: Color; currentPlayerId: string; direction: 1 | -1; winner: string | null; canPass: boolean; deckCount: number } | null;
  chat: ChatMessage[]; events: RoomEvent[]; storageMode: Room["storageMode"]; left?: boolean;
}
export interface MembershipChange { add?: string; remove?: string[] }
export interface RoomStore {
  mode: "memory" | "redis";
  read(code: string): Promise<Room | null>;
  create(room: Room, sessionHash: string): Promise<boolean>;
  commit(previousRevision: number, nextRoom: Room, membershipChange?: MembershipChange): Promise<boolean>;
  activeRoom(sessionHash: string): Promise<string | null>;
  consumeLimit(key: string, maximum: number, windowSeconds: number): Promise<boolean>;
}
