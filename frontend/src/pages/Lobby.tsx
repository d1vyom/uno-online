import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Socket } from 'socket.io-client';

interface Player {
  id: string;
  isReady?: boolean; // For future backend ready-state implementation
}

interface LobbyProps {
  socket: Socket | null;
}

export default function Lobby({ socket }: LobbyProps) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initialize state from router if available (from create/join emit)
  const [players, setPlayers] = useState<Player[]>(location.state?.players || []);
  const [hostId, setHostId] = useState<string>(location.state?.hostId || '');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!socket) {
      navigate('/');
      return;
    }

    const handlePlayerJoined = ({ players }: { players: Player[] }) => setPlayers(players);
    const handlePlayerLeft = ({ players }: { players: Player[] }) => setPlayers(players);
    const handleHostChanged = ({ hostId }: { hostId: string }) => setHostId(hostId);

    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('hostChanged', handleHostChanged);

    return () => {
      // Automatically leave room when unmounting (navigating away)
      socket.emit('leaveRoom', { roomId });
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('playerLeft', handlePlayerLeft);
      socket.off('hostChanged', handleHostChanged);
    };
  }, [socket, roomId, navigate]);

  const handleLeave = () => {
    navigate('/');
  };

  const isHost = socket?.id === hostId;

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4">
      <div className="bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-700">
        
        {/* Header / Room Code */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black">Game Lobby</h2>
            <p className="text-gray-400 mt-1">Waiting for players to join...</p>
          </div>
          <div className="bg-gray-900 px-6 py-3 rounded-xl border border-gray-600 text-center w-full sm:w-auto">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Room Code</p>
            <p className="text-3xl font-black text-uno-yellow tracking-[0.2em]">{roomId}</p>
          </div>
        </div>

        {/* Players List */}
        <div className="space-y-4 mb-8">
          {players.map((player, index) => (
            <div 
              key={player.id} 
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                player.id === socket?.id ? 'bg-gray-700/60 border-gray-500' : 'bg-gray-900/50 border-gray-700'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-inner ${
                  index === 0 ? 'bg-uno-red text-white' : 
                  index === 1 ? 'bg-uno-blue text-white' : 
                  index === 2 ? 'bg-uno-green text-white' : 
                  'bg-uno-yellow text-gray-900'
                }`}>
                  P{index + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">
                      {player.id === socket?.id ? 'You' : `Player ${player.id.substring(0, 4)}`}
                    </span>
                    {player.id === hostId && (
                      <span className="bg-uno-yellow text-gray-900 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">Host</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{player.id}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-full border border-gray-700">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  (player.id === socket?.id && isReady) ? 'bg-uno-green shadow-[0_0_8px_#50b848]' : 'bg-gray-600'
                }`}></div>
                <span className="text-sm font-medium text-gray-300">
                  {player.id === socket?.id && isReady ? 'Ready' : 'Not Ready'}
                </span>
              </div>
            </div>
          ))}
          
          {/* Empty Slots */}
          {players.length < 4 && (
            <div className="flex items-center justify-center p-6 rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/20 text-gray-500 font-semibold">
              Waiting for player {players.length + 1}...
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 border-t border-gray-700">
          <button 
            onClick={handleLeave}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            Leave Room
          </button>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button 
              onClick={() => setIsReady(!isReady)}
              className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold transition-all shadow-lg ${
                isReady 
                  ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                  : 'bg-uno-green hover:bg-green-600 text-white hover:shadow-green-500/25 hover:scale-105'
              }`}
            >
              {isReady ? 'Cancel Ready' : 'Ready Up'}
            </button>

            {isHost && (
              <button 
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold bg-uno-blue hover:bg-blue-600 text-white transition-all shadow-lg hover:shadow-blue-500/25 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                disabled={players.length < 2}
              >
                Start Game
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
