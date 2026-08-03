import { Socket, Server } from 'socket.io';
import { Room, Player } from '../types';
import { UnoEngine } from '../game/UnoEngine';

interface ActiveRoom extends Room {
  engine?: UnoEngine;
}

const rooms = new Map<string, ActiveRoom>();

const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const broadcastGameState = (io: Server, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.engine) return;

  const state = room.engine.getState();
  const players = room.engine.getPlayers();

  const playerStats = players.map(p => ({
    id: p.id,
    cardCount: p.hand?.length || 0,
    calledUno: p.calledUno || false
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
    
    io.to(p.id).emit('gameStateUpdate', clientState);
  });
};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  
  socket.on('createRoom', (callback) => {
    const roomId = generateRoomCode();
    const player: Player = { id: socket.id };
    
    rooms.set(roomId, { id: roomId, hostId: socket.id, players: [player] });
    socket.join(roomId);
    
    console.log(`[Room] ${socket.id} created room ${roomId}`);
    if (callback) callback({ success: true, roomId, hostId: socket.id });
  });

  socket.on('joinRoom', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    if (room.players.length >= 4) return callback?.({ success: false, message: 'Room is full (Max 4 players)' });
    if (room.players.some(p => p.id === socket.id)) return callback?.({ success: false, message: 'Already in room' });
    if (room.engine) return callback?.({ success: false, message: 'Game is already in progress' });

    const player: Player = { id: socket.id };
    room.players.push(player);
    socket.join(roomId);

    socket.to(roomId).emit('playerJoined', { players: room.players });
    console.log(`[Room] ${socket.id} joined room ${roomId}`);
    if (callback) callback({ success: true, roomId, room });
  });

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
      room.engine.drawCard(socket.id);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('callUno', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });

    try {
      room.engine.callUno(socket.id);
      io.to(roomId).emit('unoCalled', { playerId: socket.id });
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('leaveRoom', ({ roomId }, callback) => {
    leaveRoomLogic(io, socket, roomId);
    if (callback) callback({ success: true });
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.some(p => p.id === socket.id)) leaveRoomLogic(io, socket, roomId);
    }
  });
};

const leaveRoomLogic = (io: Server, socket: Socket, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(roomId);

  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`[Room] Room ${roomId} deleted (empty)`);
  } else {
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      io.to(roomId).emit('hostChanged', { hostId: room.hostId });
    }
    
    if (room.engine) {
      io.to(roomId).emit('playerDisconnectedMidGame', { leftPlayerId: socket.id });
    }

    io.to(roomId).emit('playerLeft', { players: room.players, leftPlayerId: socket.id });
  }
};
