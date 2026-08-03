import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Socket } from 'socket.io-client';

interface HomeProps {
  socket: Socket | null;
  userId: string;
}

export default function Home({ socket, userId }: HomeProps) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!socket) return;
    
    socket.emit('createRoom', (response: { success: boolean; roomId: string; hostId: string }) => {
      if (response.success) {
        navigate(`/room/${response.roomId}`, {
          state: { hostId: response.hostId, players: [{ id: userId, isConnected: true }] },
        });
      }
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !joinCode.trim()) return;
    
    socket.emit('joinRoom', { roomId: joinCode.toUpperCase() }, (response: any) => {
      if (response.success) {
        navigate(`/room/${response.roomId}`, {
          state: { hostId: response.room.hostId, players: response.room.players },
        });
      } else {
        setError(response.message);
      }
    });
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-5xl md:text-6xl font-black mb-8 tracking-wide">
        Welcome to <span className="text-uno-yellow drop-shadow-md">UNO</span> Multiplayer
      </h1>
      
      <p className="text-gray-400 max-w-lg mb-12 text-lg">
        Play the classic card game online with your friends. Create a private room or join an existing game to get started.
      </p>

      <div className="flex flex-col sm:flex-row gap-8 w-full max-w-xl items-center justify-center bg-gray-800/50 p-8 rounded-3xl border border-gray-700">
        <button 
          onClick={handleCreateRoom}
          className="w-full sm:w-auto bg-uno-blue text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-blue-600 hover:scale-105 transition-all shadow-lg hover:shadow-blue-500/25"
        >
          Create Game
        </button>
        
        <div className="text-gray-500 font-bold whitespace-nowrap">OR</div>

        <form onSubmit={handleJoinRoom} className="flex flex-col w-full sm:w-auto gap-2">
          <div className="flex gap-2 w-full">
            <input 
              type="text" 
              placeholder="CODE" 
              maxLength={6}
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value);
                setError('');
              }}
              className="w-full sm:w-32 px-4 py-4 rounded-xl bg-gray-900 border border-gray-600 text-white font-bold uppercase text-center focus:outline-none focus:border-uno-green focus:ring-1 focus:ring-uno-green placeholder-gray-600"
            />
            <button 
              type="submit"
              className="bg-uno-green text-white px-6 py-4 rounded-xl text-xl font-bold hover:bg-green-600 hover:scale-105 transition-all shadow-lg hover:shadow-green-500/25"
            >
              Join
            </button>
          </div>
          {error && <p className="text-uno-red text-sm font-semibold mt-1 text-left">{error}</p>}
        </form>
      </div>
    </div>
  );
}
