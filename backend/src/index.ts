import { createServer } from 'http';
import app from './app';
import { initializeSocket } from './sockets';
import { env } from './config/env';

const startServer = () => {
  try {
    const httpServer = createServer(app);
    
    // Initialize Socket.IO
    initializeSocket(httpServer);

    httpServer.listen(env.PORT, () => {
      console.log(`[Server] Running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]:', error);
  process.exit(1);
});

startServer();
