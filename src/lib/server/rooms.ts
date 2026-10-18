import { randomInt, randomUUID } from "node:crypto";
import { applyGameAction, createGame, removeGamePlayer } from "../game/engine";
import { GameError } from "../game/types";
import { projectRoom } from "./snapshot";
import { ServiceError, type ActionRequest, type Room, type RoomPlayer, type RoomSnapshot, type RoomStore } from "./types";
const random = () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function codeValue(code: string): string {
  const result = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(result)) throw new ServiceError("Enter a six-character room code.");
  return result;
}
function nameValue(name: string): string {
  const result = name.trim();
  if (!result || result.length > 24 || /[\u0000-\u001f\u007f]/.test(result)) throw new ServiceError("Use a name between 1 and 24 characters.");
  return result;
}
function player(sessionHash: string, name: string, now: number): RoomPlayer {
  return { id: randomUUID(), sessionHash, name: nameValue(name), ready: false, lastSeen: now, wins: 0 };
}
function event(room: Room, text: string, time: number) {
  room.events.push({ id: randomUUID(), text, time }); room.events = room.events.slice(-30);
}
function finish(room: Room, now: number) {
  if (room.phase === "playing" && room.game?.winner) {
    room.phase = "finished";
    const winner = room.players.find((p) => p.id === room.game!.winner);
    if (winner) { winner.wins++; event(room, winner.name + " won the round.", now); }
  }
}
function remove(room: Room, id: string, now: number) {
  const departing = room.players.find((p) => p.id === id);
  room.players = room.players.filter((p) => p.id !== id);
  if (room.game) room.game = removeGamePlayer(room.game, id, random);
  if (room.hostId === id) room.hostId = room.players[0]?.id ?? "";
  if (departing) event(room, departing.name + " left the table.", now);
  finish(room, now);
}
async function load(store: RoomStore, rawCode: string, session: string | null, now: number): Promise<Room> {
  const code = codeValue(rawCode);
  for (let attempt = 0; attempt < 6; attempt++) {
    const room = await store.read(code);
    if (!room) throw new ServiceError("That room does not exist or has expired.", 404);
    if (session && !room.players.some((p) => p.sessionHash === session)) throw new ServiceError("Join this room to take a seat.", 403);
    const expired = room.players.filter((p) => now - p.lastSeen >= 90_000);
    if (!expired.length) return room;
    const revision = room.revision;
    for (const p of expired) remove(room, p.id, now);
    room.revision++;
    if (await store.commit(revision, room, { remove: expired.map((p) => p.sessionHash) })) {
      if (!room.players.length) throw new ServiceError("This room has expired.", 404);
      return room;
    }
  }
  throw new ServiceError("The table changed. Refresh and try again.", 409);
}

export async function createRoom(store: RoomStore, sessionHash: string, name: string, now = Date.now()): Promise<RoomSnapshot> {
  const host = player(sessionHash, name, now);
  const active = await store.activeRoom(sessionHash);
  if (active) throw new ServiceError("You already have a table at /room/" + active + ". Rejoin it or leave first.", 409);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const room: Room = {
      schemaVersion: 1, code, revision: 0, hostId: host.id, phase: "lobby", players: [host],
      game: null, chat: [], events: [], acceptedActions: [], storageMode: store.mode,
    };
    event(room, host.name + " opened the table.", now);
    if (await store.create(room, sessionHash)) return projectRoom(room, sessionHash, now);
  }
  throw new ServiceError("Could not create a room. Rejoin an existing table or retry.", 409);
}

export async function joinRoom(store: RoomStore, code: string, sessionHash: string, name: string, now = Date.now()): Promise<RoomSnapshot> {
  const validName = nameValue(name), normalized = codeValue(code);
  const active = await store.activeRoom(sessionHash);
  if (active && active !== normalized) throw new ServiceError("Leave your other room first: /room/" + active, 409);
  for (let attempt = 0; attempt < 6; attempt++) {
    const room = await load(store, normalized, null, now);
    if (room.players.some((p) => p.sessionHash === sessionHash)) return projectRoom(room, sessionHash, now);
    if (room.players.length >= 4) throw new ServiceError("This table is full. Four players is the limit.", 409);
    if (room.phase !== "lobby") throw new ServiceError("This round has already started. Join after the rematch.", 409);
    const revision = room.revision;
    room.players.push(player(sessionHash, validName, now));
    event(room, validName + " joined the table.", now); room.revision++;
    if (await store.commit(revision, room, { add: sessionHash })) return projectRoom(room, sessionHash, now);
  }
  throw new ServiceError("The table changed. Refresh and try again.", 409);
}

export async function readRoom(store: RoomStore, code: string, sessionHash: string, now = Date.now()): Promise<RoomSnapshot> {
  return projectRoom(await load(store, code, sessionHash, now), sessionHash, now);
}

export async function actOnRoom(store: RoomStore, code: string, sessionHash: string, request: ActionRequest, now = Date.now()): Promise<RoomSnapshot> {
  const room = await load(store, code, sessionHash, now), revision = room.revision;
  const actor = room.players.find((p) => p.sessionHash === sessionHash)!;
  if (!actor) throw new ServiceError("Your seat has expired. Join again.", 403);
  if (room.acceptedActions.some((a) => a.sessionHash === sessionHash && a.actionId === request.actionId)) return projectRoom(room, sessionHash, now);
  const action = request.action;
  // Presence is commutative; it need not reject a newer game revision.
  if (action.type !== "heartbeat" && revision !== request.expectedRevision) throw new ServiceError("The table changed. Refresh and try again.", 409);
  if (action.type === "heartbeat" && now - actor.lastSeen < 10_000) return projectRoom(room, sessionHash, now);
  if (room.phase === "finished" && !["leave", "rematch", "heartbeat"].includes(action.type)) throw new ServiceError("This round has finished. Start a rematch.", 409);
  const previousSnapshot = projectRoom(room, sessionHash, now);
  if (action.type === "heartbeat") actor.lastSeen = now;
  else if (action.type === "leave") remove(room, actor.id, now);
  else if (action.type === "ready") {
    if (room.phase !== "lobby") throw new ServiceError("Readiness can change only in the lobby.", 409);
    actor.ready = action.ready;
  } else if (action.type === "start" || action.type === "rematch") {
    if (actor.id !== room.hostId) throw new ServiceError("Only the host can do that.", 403);
    if (action.type === "start") {
      if (room.phase !== "lobby" || room.players.length < 2 || !room.players.every((p) => p.ready && now - p.lastSeen < 30_000)) throw new ServiceError("Two to four connected players must all be ready.", 409);
      room.game = createGame(room.players.map((p) => p.id), random); room.phase = "playing";
      event(room, "A new round started. Good luck!", now);
    } else {
      if (room.phase !== "finished") throw new ServiceError("Finish this round before a rematch.", 409);
      room.game = null; room.phase = "lobby"; room.players.forEach((p) => { p.ready = false; });
      event(room, "Rematch! Ready up for another round.", now);
    }
  } else if (action.type === "chat") {
    const text = action.text.trim();
    if (!text || text.length > 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new ServiceError("Send a message between 1 and 200 characters.");
    room.chat.push({ id: randomUUID(), playerId: actor.id, name: actor.name, text, time: now });
    room.chat = room.chat.slice(-100);
  } else {
    if (room.phase !== "playing" || !room.game) throw new ServiceError("Wait for the host to start a round.", 409);
    const current = room.players.find((p) => p.id === room.game!.currentPlayerId);
    if (!current || now - current.lastSeen >= 30_000) throw new ServiceError("Waiting for the current player to reconnect.", 409);
    try { room.game = applyGameAction(room.game, actor.id, action, random); }
    catch (error) { if (error instanceof GameError) throw new ServiceError(error.message, 409); throw error; }
    const descriptions = { play: "played a card", draw: "drew a card", pass: "passed", uno: "called UNO!" };
    event(room, actor.name + " " + descriptions[action.type] + ".", now); finish(room, now);
  }
  room.revision++;
  room.acceptedActions.push({ sessionHash, actionId: request.actionId });
  room.acceptedActions = room.acceptedActions.slice(-100);
  if (!await store.commit(revision, room, action.type === "leave" ? { remove: [sessionHash] } : undefined)) throw new ServiceError("The table changed. Refresh and try again.", 409);
  return action.type === "leave" ? { ...previousSnapshot, revision: room.revision, hand: [], legalCardIds: [], left: true } : projectRoom(room, sessionHash, now);
}
