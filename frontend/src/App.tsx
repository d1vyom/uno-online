import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';

function App() {
  // Omitted the first variable from destructuring to resolve ts(6133)
  const [, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io();
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
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout isConnected={isConnected} />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  );
}

export default App;
