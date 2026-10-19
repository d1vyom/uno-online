import { z } from "zod";
import type { Room } from "./types";
const id = z.string().min(1).max(100);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const coloredValue = z.enum(["0","1","2","3","4","5","6","7","8","9","skip","reverse","draw2"]);
const card = z.discriminatedUnion("color", [
  z.object({ id, color: z.enum(["red","blue","green","yellow"]), value: coloredValue }).strict(),
  z.object({ id, color: z.literal("wild"), value: z.enum(["wild","draw4"]) }).strict(),
]);
const game = z.object({
  playerIds: z.array(id).min(1).max(4),
  hands: z.record(id, z.array(card).max(108)),
  deck: z.array(card).max(108), discard: z.array(card).min(1).max(108),
  currentPlayerId: id, direction: z.union([z.literal(1),z.literal(-1)]),
  activeColor: z.enum(["red","blue","green","yellow"]),
  drawnCardId: id.nullable(), unoIds: z.array(id).max(4), winner: id.nullable(),
}).strict();
const schema: z.ZodType<Room> = z.object({
  schemaVersion: z.literal(1), code: z.string().regex(/^[A-Z2-9]{6}$/),
  revision, actionRevision: revision, hostId: id, phase: z.enum(["lobby","playing","finished"]),
  players: z.array(z.object({
    id, sessionHash: z.string().min(1).max(200), name: z.string().min(1).max(24),
    ready: z.boolean(), lastSeen: revision, wins: revision,
  }).strict()).min(1).max(4),
  game: game.nullable(), winnerName: z.string().min(1).max(100).nullable(),
  chat: z.array(z.object({
    id, playerId: id, name: z.string().min(1).max(24), text: z.string().min(1).max(200), time: revision,
  }).strict()).max(100),
  events: z.array(z.object({ id, text: z.string().min(1).max(1000), time: revision }).strict()).max(30),
  acceptedActions: z.array(z.object({ sessionHash: z.string().min(1).max(200), actionId: id }).strict()).max(100),
  storageMode: z.literal("supabase"),
}).strict().refine((room) => {
  const ids = room.players.map((p) => p.id);
  if (room.actionRevision > room.revision || !ids.includes(room.hostId) ||
      new Set(ids).size !== ids.length || new Set(room.players.map((p) => p.sessionHash)).size !== ids.length) return false;
  if (room.phase === "lobby") return room.game === null;
  const state = room.game;
  return !!state && state.playerIds.length === ids.length &&
    state.playerIds.every((id) => ids.includes(id) && Array.isArray(state.hands[id])) &&
    state.playerIds.includes(state.currentPlayerId) &&
    (room.phase === "finished" ? state.winner !== null : state.winner === null);
});
export function parseStoredRoom(value: unknown, code: string): Room {
  const parsed = schema.parse(value);
  if (parsed.code !== code) throw new Error("Mismatched room.");
  return parsed;
}
