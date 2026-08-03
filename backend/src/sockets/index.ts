import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { env } from '../config/env';
import { handleRoomEvents } from './roomManager';

export const initializeSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // Register room management events
    handleRoomEvents(io, socket);
    
    socket.on('error', (err) => {
      console.error(`[Socket] Error on connection ${socket.id}:`, err);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] User disconnected (${socket.id}): ${reason}`);
    });
  });

  return io;
};
