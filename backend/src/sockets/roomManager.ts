import { Socket, Server } from 'socket.io';
import { Room, Player } from '../types';
import { UnoEngine } from '../game/UnoEngine';

interface ActiveRoom extends Room {
  engine?: UnoEngine;
}

const rooms = new Map<string, ActiveRoom>();
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const broadcastGameState = (io: Server, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.engine) return;

  const state = room.engine.getState();
  const players = room.engine.getPlayers();

  const playerStats = players.map(p => {
    const roomPlayer = room.players.find(rp => rp.id === p.id);
    return {
      id: p.id,
      cardCount: p.hand?.length || 0,
      calledUno: p.calledUno || false,
      isConnected: roomPlayer?.isConnected !== false
    };
  });

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
    
    // Send directly to the userId's personal room
    io.to(p.id).emit('gameStateUpdate', clientState);
  });
};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) {
    console.error('[Socket] Connection rejected: No userId provided');
    socket.disconnect();
    return;
  }

  // Bind the dynamically changing socket to a permanent room identified by userId
  socket.join(userId);

  // Auto-Reconnect Logic: Check if the user is already in an active room
  for (const [roomId, room] of rooms.entries()) {
    const player = room.players.find(p => p.id === userId);
    if (player) {
      player.isConnected = true;
      socket.join(roomId);
      
      // Clear pending drop timeout
      if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId)!);
        disconnectTimeouts.delete(userId);
        console.log(`[Room] ${userId} reconnected to ${roomId}, timeout cancelled.`);
      }

      // Restore state
      io.to(roomId).emit('playerJoined', { players: room.players });
      if (room.engine) {
        broadcastGameState(io, roomId);
      }
    }
  }

  socket.on('createRoom', (callback) => {
    const roomId = generateRoomCode();
    const player: Player = { id: userId, isConnected: true };
    
    rooms.set(roomId, { id: roomId, hostId: userId, players: [player] });
    socket.join(roomId);
    
    console.log(`[Room] ${userId} created room ${roomId}`);
    if (callback) callback({ success: true, roomId, hostId: userId });
  });

  socket.on('joinRoom', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    
    if (room.players.some(p => p.id === userId)) {
      // Re-joining via code input while technically already in the room
      return callback?.({ success: true, roomId, room });
    }

    if (room.players.length >= 4) return callback?.({ success: false, message: 'Room is full (Max 4 players)' });
    if (room.engine) return callback?.({ success: false, message: 'Game is already in progress' });

    const player: Player = { id: userId, isConnected: true };
    room.players.push(player);
    socket.join(roomId);

    socket.to(roomId).emit('playerJoined', { players: room.players });
    console.log(`[Room] ${userId} joined room ${roomId}`);
    if (callback) callback({ success: true, roomId, room });
  });

  socket.on('startGame', ({ roomId }, callback) => {
    const room = rooms.get(roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    if (room.hostId !== userId) return callback?.({ success: false, message: 'Only the host can start the game' });
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
      room.engine.playCard(userId, cardId, declaredColor);
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
      room.engine.drawCard(userId);
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
      room.engine.callUno(userId);
      io.to(roomId).emit('unoCalled', { playerId: userId });
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('leaveRoom', ({ roomId }, callback) => {
    leaveRoomLogic(io, userId, roomId);
    if (callback) callback({ success: true });
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      const player = room.players.find(p => p.id === userId);
      if (player) {
        player.isConnected = false;
        
        io.to(roomId).emit('playerJoined', { players: room.players }); 
        if (room.engine) broadcastGameState(io, roomId);

        // 30-Second Disconnect Grace Period
        const timeout = setTimeout(() => {
          leaveRoomLogic(io, userId, roomId);
          disconnectTimeouts.delete(userId);
        }, 30000);
        
        disconnectTimeouts.set(userId, timeout);
        console.log(`[Room] ${userId} disconnected. 30s reconnect window started.`);
      }
    }
  });
};

const leaveRoomLogic = (io: Server, userId: string, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== userId);

  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`[Room] Room ${roomId} deleted (empty)`);
  } else {
    if (room.hostId === userId) {
      room.hostId = room.players[0].id;
      io.to(roomId).emit('hostChanged', { hostId: room.hostId });
    }
    
    if (room.engine) {
      io.to(roomId).emit('playerDisconnectedMidGame', { leftPlayerId: userId });
    }

    io.to(roomId).emit('playerLeft', { players: room.players, leftPlayerId: userId });
  }
};
