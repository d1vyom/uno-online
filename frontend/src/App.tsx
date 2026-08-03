import { useEffect, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const userId = useMemo(() => {
    let id = localStorage.getItem('uno_userId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 12);
      localStorage.setItem('uno_userId', id);
    }
    return id;
  }, []);

  useEffect(() => {
    // In production, use the VITE_BACKEND_URL. 
    // In development, undefined falls back to the Vite proxy in vite.config.ts.
    const backendUrl = import.meta.env.VITE_BACKEND_URL || undefined;
    const newSocket = io(backendUrl, { auth: { userId } });
    
    setSocket(newSocket);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);

    return () => {
      newSocket.off('connect', onConnect);
      newSocket.off('disconnect', onDisconnect);
      newSocket.close();
    };
  }, [userId]);

  return (
    <Routes>
      <Route path="/" element={<Layout isConnected={isConnected} />}>
        <Route index element={<Home socket={socket} userId={userId} />} />
        <Route path="room/:roomId" element={<Lobby socket={socket} userId={userId} />} />
        <Route path="game/:roomId" element={<Game socket={socket} userId={userId} />} />
      </Route>
    </Routes>
  );
}

export default App;
