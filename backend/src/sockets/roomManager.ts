import { Socket, Server } from 'socket.io';
import { Room, Player, ChatMessage } from '../types';
import { UnoEngine } from '../game/UnoEngine';

interface ActiveRoom extends Room {
  engine?: UnoEngine;
  isProcessing?: boolean; // Mutex lock to prevent race conditions and duplicate actions
}

const rooms = new Map<string, ActiveRoom>();
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Spam Prevention: In-memory Rate Limiter
const rateLimits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const MAX_EVENTS_PER_WINDOW = 8; // Max 8 socket events per second

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = rateLimits.get(userId) || [];
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  const recentTimestamps = timestamps.filter(ts => ts > windowStart);
  recentTimestamps.push(now);
  rateLimits.set(userId, recentTimestamps);

  return recentTimestamps.length <= MAX_EVENTS_PER_WINDOW;
};

// Security: Payload Validation Helpers
const isValidString = (val: any, min = 1, max = 100): boolean => {
  return typeof val === 'string' && val.trim().length >= min && val.length <= max;
};

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
    
    io.to(p.id).emit('gameStateUpdate', clientState);
  });
};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  const userId = socket.handshake.auth.userId;
  
  // Security: Reject connections without a valid userId payload
  if (!isValidString(userId, 1, 50)) {
    console.error('[Socket] Connection rejected: Invalid or missing userId');
    socket.disconnect();
    return;
  }

  // Security: Socket-level rate limiting middleware
  socket.use((packet, next) => {
    if (!checkRateLimit(userId)) {
      console.warn(`[Security] Rate limit exceeded by user: ${userId}`);
      return next(new Error('Rate limit exceeded. Please slow down.'));
    }
    next();
  });

  socket.join(userId);

  for (const [roomId, room] of rooms.entries()) {
    const player = room.players.find(p => p.id === userId);
    if (player) {
      player.isConnected = true;
      socket.join(roomId);
      
      if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId)!);
        disconnectTimeouts.delete(userId);
      }

      io.to(roomId).emit('playerJoined', { players: room.players });
      io.to(userId).emit('chatHistory', room.chatHistory);
      
      if (room.engine) {
        broadcastGameState(io, roomId);
      }
    }
  }

  socket.on('createRoom', (callback) => {
    const roomId = generateRoomCode();
    const player: Player = { id: userId, isConnected: true };
    
    rooms.set(roomId, { id: roomId, hostId: userId, players: [player], chatHistory: [], isProcessing: false });
    socket.join(roomId);
    
    if (callback) callback({ success: true, roomId, hostId: userId });
  });

  socket.on('joinRoom', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) {
      return callback?.({ success: false, message: 'Invalid room code format' });
    }
    
    const roomId = payload.roomId.toUpperCase();
    const room = rooms.get(roomId);
    
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    if (room.players.some(p => p.id === userId)) {
      io.to(userId).emit('chatHistory', room.chatHistory);
      return callback?.({ success: true, roomId, room });
    }
    if (room.players.length >= 4) return callback?.({ success: false, message: 'Room is full (Max 4 players)' });
    if (room.engine) return callback?.({ success: false, message: 'Game is already in progress' });

    room.isProcessing = true;
    try {
      const player: Player = { id: userId, isConnected: true };
      room.players.push(player);
      socket.join(roomId);

      socket.to(roomId).emit('playerJoined', { players: room.players });
      io.to(userId).emit('chatHistory', room.chatHistory);
      
      if (callback) callback({ success: true, roomId, room });
    } finally {
      room.isProcessing = false;
    }
  });

  socket.on('sendMessage', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6) || !isValidString(payload.text, 1, 100)) {
      return callback?.({ success: false, message: 'Invalid message payload' });
    }

    const { roomId, text } = payload;
    const room = rooms.get(roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    
    // Security: Validate sender is actually in the room
    if (!room.players.some(p => p.id === userId)) {
      return callback?.({ success: false, message: 'Unauthorized' });
    }

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 10),
      senderId: userId,
      text: text.trim(),
      timestamp: Date.now()
    };

    room.chatHistory.push(message);
    if (room.chatHistory.length > 100) room.chatHistory.shift(); 

    io.to(roomId).emit('chatMessage', message);
    if (callback) callback({ success: true });
  });

  socket.on('startGame', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload' });
    
    const roomId = payload.roomId;
    const room = rooms.get(roomId);
    
    if (!room) return callback?.({ success: false, message: 'Room not found' });
    if (room.hostId !== userId) return callback?.({ success: false, message: 'Only the host can start the game' });
    if (room.players.length < 2) return callback?.({ success: false, message: 'Need at least 2 players' });
    if (room.isProcessing) return callback?.({ success: false, message: 'Action in progress' });

    room.isProcessing = true;
    try {
      room.engine = new UnoEngine(room.players);
      io.to(roomId).emit('gameStarted');
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.isProcessing = false;
    }
  });

  socket.on('playCard', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6) || !isValidString(payload.cardId, 1, 20)) {
      return callback?.({ success: false, message: 'Invalid payload format' });
    }
    
    if (payload.declaredColor && !['Red', 'Blue', 'Green', 'Yellow'].includes(payload.declaredColor)) {
      return callback?.({ success: false, message: 'Invalid color declared' });
    }

    const { roomId, cardId, declaredColor } = payload;
    const room = rooms.get(roomId);
    
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });
    if (room.isProcessing) return callback?.({ success: false, message: 'Processing previous action' });

    room.isProcessing = true;
    try {
      room.engine.playCard(userId, cardId, declaredColor);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.isProcessing = false;
    }
  });

  socket.on('drawCard', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload' });

    const roomId = payload.roomId;
    const room = rooms.get(roomId);
    
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });
    if (room.isProcessing) return callback?.({ success: false, message: 'Processing previous action' });

    room.isProcessing = true;
    try {
      room.engine.drawCard(userId);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.isProcessing = false;
    }
  });

  socket.on('callUno', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload' });

    const roomId = payload.roomId;
    const room = rooms.get(roomId);
    
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game not running' });
    if (room.isProcessing) return callback?.({ success: false, message: 'Processing previous action' });

    room.isProcessing = true;
    try {
      room.engine.callUno(userId);
      io.to(roomId).emit('unoCalled', { playerId: userId });
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.isProcessing = false;
    }
  });

  socket.on('leaveRoom', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload' });
    
    leaveRoomLogic(io, userId, payload.roomId);
    if (callback) callback({ success: true });
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      const player = room.players.find(p => p.id === userId);
      if (player) {
        player.isConnected = false;
        
        io.to(roomId).emit('playerJoined', { players: room.players }); 
        if (room.engine) broadcastGameState(io, roomId);

        const timeout = setTimeout(() => {
          leaveRoomLogic(io, userId, roomId);
          disconnectTimeouts.delete(userId);
        }, 30000);
        
        disconnectTimeouts.set(userId, timeout);
      }
    }
  });
};

const leaveRoomLogic = (io: Server, userId: string, roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.isProcessing = true;
  try {
    room.players = room.players.filter(p => p.id !== userId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
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
  } finally {
    if (rooms.has(roomId)) room.isProcessing = false;
  }
};
