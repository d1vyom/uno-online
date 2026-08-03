import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Vite proxy handles the connection to the backend port
    const newSocket = io();
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4 text-red-500">UNO Multiplayer</h1>
        <p className="text-xl">
          Status: {socket?.connected ? 'Connected to server' : 'Connecting...'}
        </p>
      </div>
    </div>
  );
}

export default App;
