import { Socket, Server } from 'socket.io';
import { Room, Player } from '../types';

// In-memory store for active rooms
const rooms = new Map<string, Room>();

// Generates a 6-character alphanumeric room code
const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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

    const player: Player = { id: socket.id };
    room.players.push(player);
    socket.join(roomId);

    // Notify others in the room
    socket.to(roomId).emit('playerJoined', { players: room.players });
    
    console.log(`[Room] ${socket.id} joined room ${roomId}`);
    if (callback) callback({ success: true, roomId, room });
  });

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
    io.to(roomId).emit('playerLeft', { players: room.players, leftPlayerId: socket.id });
  }
  
  console.log(`[Room] ${socket.id} left room ${roomId}`);
};
