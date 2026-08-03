import { Socket, Server } from 'socket.io';
import { Room, Player, ChatMessage } from '../types';
import { UnoEngine } from '../game/UnoEngine';

interface ActiveRoom extends Room {
  engine?: UnoEngine;
  processingLock?: boolean;
}

const rooms = new Map<string, ActiveRoom>();
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();
const rateLimits = new Map<string, number[]>();

const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_EVENTS_PER_WINDOW = 8;

// Periodic cleanup to prevent memory leaks in rate limits map
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of rateLimits.entries()) {
    const valid = timestamps.filter(ts => ts > now - RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimits.delete(userId);
    } else {
      rateLimits.set(userId, valid);
    }
  }
}, 30000);

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = rateLimits.get(userId) || [];
  const recent = timestamps.filter(ts => ts > now - RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimits.set(userId, recent);

  return recent.length <= MAX_EVENTS_PER_WINDOW;
};

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
      currentTurnId: players[state.currentTurnIndex] ? players[state.currentTurnIndex].id : '',
      playDirection: state.playDirection,
      winner: state.winner,
      hand: p.hand || [],
      playerStats
    };
    
    io.to(p.id).emit('gameStateUpdate', clientState);
  });
};

export const handleRoomEvents = (io: Server, socket: Socket) => {
  const userId = socket.handshake.auth.userId;
  
  if (!isValidString(userId, 1, 50)) {
    socket.disconnect();
    return;
  }

  socket.use((_, next) => {
    if (!checkRateLimit(userId)) {
      return next(new Error('Rate limit exceeded.'));
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
    
    rooms.set(roomId, { 
      id: roomId, 
      hostId: userId, 
      players: [player], 
      chatHistory: [], 
      processingLock: false 
    });
    socket.join(roomId);
    
    if (callback) callback({ success: true, roomId, hostId: userId });
  });

  socket.on('joinRoom', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) {
      return callback?.({ success: false, message: 'Invalid room code.' });
    }
    
    const roomId = payload.roomId.toUpperCase();
    const room = rooms.get(roomId);
    
    if (!room) return callback?.({ success: false, message: 'Room not found.' });
    if (room.players.some(p => p.id === userId)) {
      io.to(userId).emit('chatHistory', room.chatHistory);
      return callback?.({ success: true, roomId, room });
    }
    if (room.players.length >= 4) return callback?.({ success: false, message: 'Room is full.' });
    if (room.engine) return callback?.({ success: false, message: 'Game in progress.' });

    const player: Player = { id: userId, isConnected: true };
    room.players.push(player);
    socket.join(roomId);

    socket.to(roomId).emit('playerJoined', { players: room.players });
    io.to(userId).emit('chatHistory', room.chatHistory);
    
    if (callback) callback({ success: true, roomId, room });
  });

  socket.on('sendMessage', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6) || !isValidString(payload.text, 1, 100)) {
      return callback?.({ success: false, message: 'Invalid message payload.' });
    }

    const { roomId, text } = payload;
    const room = rooms.get(roomId);
    if (!room || !room.players.some(p => p.id === userId)) {
      return callback?.({ success: false, message: 'Unauthorized.' });
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
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid room.' });
    
    const room = rooms.get(payload.roomId);
    if (!room) return callback?.({ success: false, message: 'Room not found.' });
    if (room.hostId !== userId) return callback?.({ success: false, message: 'Host authorization required.' });
    if (room.players.length < 2) return callback?.({ success: false, message: 'Minimum 2 players required.' });

    try {
      room.engine = new UnoEngine(room.players);
      io.to(payload.roomId).emit('gameStarted');
      broadcastGameState(io, payload.roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('playCard', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6) || !isValidString(payload.cardId, 1, 20)) {
      return callback?.({ success: false, message: 'Invalid play payload.' });
    }

    const { roomId, cardId, declaredColor } = payload;
    const room = rooms.get(roomId);
    
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game active check failed.' });
    if (room.processingLock) return callback?.({ success: false, message: 'Action pending.' });

    room.processingLock = true;
    try {
      room.engine.playCard(userId, cardId, declaredColor);
      broadcastGameState(io, roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.processingLock = false;
    }
  });

  socket.on('drawCard', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload.' });

    const room = rooms.get(payload.roomId);
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game active check failed.' });
    if (room.processingLock) return callback?.({ success: false, message: 'Action pending.' });

    room.processingLock = true;
    try {
      room.engine.drawCard(userId);
      broadcastGameState(io, payload.roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    } finally {
      room.processingLock = false;
    }
  });

  socket.on('callUno', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload.' });

    const room = rooms.get(payload.roomId);
    if (!room || !room.engine) return callback?.({ success: false, message: 'Game active check failed.' });

    try {
      room.engine.callUno(userId);
      io.to(payload.roomId).emit('unoCalled', { playerId: userId });
      broadcastGameState(io, payload.roomId);
      if (callback) callback({ success: true });
    } catch (error: any) {
      if (callback) callback({ success: false, message: error.message });
    }
  });

  socket.on('leaveRoom', (payload, callback) => {
    if (!payload || !isValidString(payload.roomId, 6, 6)) return callback?.({ success: false, message: 'Invalid payload.' });
    
    leaveRoomLogic(io, userId, payload.roomId);
    if (callback) callback({ success: true });
  });

  socket.on('disconnect', () => {
    rateLimits.delete(userId);
    
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

  room.players = room.players.filter(p => p.id !== userId);

  // Synchronize player removal inside UnoEngine
  if (room.engine) {
    const { gameEnded } = room.engine.removePlayer(userId);
    if (gameEnded) {
      broadcastGameState(io, roomId);
    }
  }

  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else {
    if (room.hostId === userId) {
      room.hostId = room.players[0].id;
      io.to(roomId).emit('hostChanged', { hostId: room.hostId });
    }
    
    if (room.engine) {
      io.to(roomId).emit('playerDisconnectedMidGame', { leftPlayerId: userId });
      broadcastGameState(io, roomId);
    }

    io.to(roomId).emit('playerLeft', { players: room.players, leftPlayerId: userId });
  }
};
