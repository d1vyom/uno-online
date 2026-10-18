import { canPlay } from "../game/engine";
import { ServiceError, type Room, type RoomSnapshot } from "./types";
export function projectRoom(room: Room, sessionHash: string, now: number): RoomSnapshot {
  const viewer = room.players.find((p) => p.sessionHash === sessionHash);
  if (!viewer) throw new ServiceError("Your seat is no longer in this room. Join again.", 403);
  const game = room.game, hand = game?.hands[viewer.id] ?? [];
  return {
    code: room.code, revision: room.revision, hostId: room.hostId, myId: viewer.id, phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, ready: p.ready, connected: now - p.lastSeen < 30_000,
      cardCount: game?.hands[p.id]?.length ?? 0, uno: game?.unoIds.includes(p.id) ?? false, wins: p.wins,
    })),
    hand, legalCardIds: game ? hand.filter((c) => canPlay(game, viewer.id, c.id)).map((c) => c.id) : [],
    game: game ? {
      topCard: game.discard.at(-1)!, activeColor: game.activeColor, currentPlayerId: game.currentPlayerId,
      direction: game.direction, winner: game.winner, winnerName: room.winnerName,
      canPass: game.currentPlayerId === viewer.id && !!game.drawnCardId, deckCount: game.deck.length,
    } : null,
    chat: room.chat, events: room.events, storageMode: room.storageMode,
  };
}
