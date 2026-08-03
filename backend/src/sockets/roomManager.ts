import { Socket, Server } from 'socket.io';
import { Room, Player } from '../types';
import { UnoEngine } from '../game/UnoEngine';

// Extend the Room interface locally to hold the active game engine
interface ActiveRoom extends Room {
  engine?: UnoEngine;
}

// In-memory store for active rooms
const rooms = new Map<string, ActiveRoom>();

// Generates a 6-character alphanumeric room code
const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Securely broadcasts game state to each player individually
const broadcastGameState = (io: Server, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.engine) return;

  const state = room.engine.getState();
  const players = room.engine.getPlayers();

  // Map out card counts to show UI representations of opponent hands without exposing actual cards
  const playerStats = players.map(p => ({
    id: p.id,
    cardCount: p.hand?.length || 0
  }));

  players.forEach(p => {
    const clientState = {
      topCard: state.discardPile[state.discardPile.length - 1],
      activeColor: state.activeColor,
      currentTurnId: players[state.currentTurnIndex].id,
      playDirection: state.playDirection,
      winner: state.winner,
      hand: p.hand,
      playerStats
    };
    
    // Emit only to this specific player's socket to prevent cheating
    io.to(p.id).emit('gameStateUpdate', clientState);
  });
};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  
  socket.on('createRoom', (callback) => {
    const roomId = generateRoomCode();
    const player: Player = { id: socket.id };
    
    rooms.set(roomId, {
      id: roomId,
      hostId: socket.id,
      players: [player]
    });

    socket.join(roomId);
    
    console.log(`[Room] ${socket.id} created room ${roomId}`);
    if (callback) callback({ success: true, roomId, hostId: socket.id });
  });

  socket.on('joinRoom', ({ roomId }, callback) => {
    const room = rooms.get(roomId);

    if (!room) {
      if (callback) callback({ success: false, message: 'Room not found' });
      return;
    }

    if (room.players.length >= 4) {
      if (callback) callback({ success: false, message: 'Room is full (Max 4 players)' });
      return;
    }

    if (room.players.some(p => p.id === socket.id)) {
      if (callback) callback({ success: false, message: 'Already in room' });
      return;
    }

    if (room.engine) {
      if (callback) callback({ success: false, message: 'Game is already in progress' });
      return;
    }

    const player: Player = { id: socket.id };
    room.players.push(player);
    socket.join(roomId);

    // Notify others in the room
    socket.to(roomId).emit('playerJoined', { players: room.players });
    
    console.log(`[Room] ${socket.id} joined room ${roomId}`);
    if (callback) callback({ success: true, roomId, room });
  });

  // --- GAMEPLAY EVENTS ---

  socket.on('startGame', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    if (room.hostId !== socket.id) return callback?.({ success: false, message: 'Only the host can start the game' });
    if (room.players.length < 2) return callback?.({ success: false, message: 'Need at least 2 players' });

    try {
      room.engine = new UnoEngine(room.players);
      io.to(roomId).emit('gameStarted');
      broadcastGameState(io, roomId);
      console.log(`[Game] Room ${roomId} game started`);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('playCard', ({ roomId, cardId, declaredColor }, callback) => {
    const room = rooms.get(roomId);
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });

    try {
      // Validation occurs securely inside the engine
      room.engine.playCard(socket.id, cardId, declaredColor);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('drawCard', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });

    try {
      // Validation occurs securely inside the engine
      room.engine.drawCard(socket.id);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  // -----------------------

  socket.on('leaveRoom', ({ roomId }, callback) => {
    leaveRoomLogic(io, socket, roomId);
    if (callback) callback({ success: true });
  });

  socket.on('disconnect', () => {
    // Check all rooms to remove the disconnected player
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.some(p => p.id === socket.id)) {
        leaveRoomLogic(io, socket, roomId);
      }
    }
  });
};

const leaveRoomLogic = (io: Server, socket: Socket, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(roomId);

  if (room.players.length === 0) {
    // Cleanup empty room
    rooms.delete(roomId);
    console.log(`[Room] Room ${roomId} deleted (empty)`);
  } else {
    // Reassign host if the host left
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      io.to(roomId).emit('hostChanged', { hostId: room.hostId });
      console.log(`[Room] Room ${roomId} host changed to ${room.hostId}`);
    }
    
    // If a game is running and someone leaves, we can notify the room
    if (room.engine) {
      io.to(roomId).emit('playerDisconnectedMidGame', { leftPlayerId: socket.id });
    }

    io.to(roomId).emit('playerLeft', { players: room.players, leftPlayerId: socket.id });
  }
  
  console.log(`[Room] ${socket.id} left room ${roomId}`);
};
