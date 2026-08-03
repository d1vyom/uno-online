import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { ClientGameState, CardColor } from '../types/game';
import UnoCard from '../components/UnoCard';

interface GameProps {
  socket: Socket | null;
}

export default function Game({ socket }: GameProps) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [wildCardId, setWildCardId] = useState<string | null>(null); // Tracks card ID waiting for color selection

  useEffect(() => {
    if (!socket) {
      navigate('/');
      return;
    }

    const handleStateUpdate = (state: ClientGameState) => setGameState(state);
    
    socket.on('gameStateUpdate', handleStateUpdate);
    socket.on('playerDisconnectedMidGame', () => alert('A player disconnected.'));

    return () => {
      socket.off('gameStateUpdate', handleStateUpdate);
      socket.off('playerDisconnectedMidGame');
    };
  }, [socket, navigate]);

  const handlePlayCard = (cardId: string, declaredColor?: CardColor) => {
    socket?.emit('playCard', { roomId, cardId, declaredColor }, (res: any) => {
      if (!res.success) alert(res.message); // Basic error handling
    });
    setWildCardId(null);
  };

  const handleCardClick = (card: any) => {
    if (gameState?.currentTurnId !== socket?.id) return;
    
    if (card.color === 'Wild') {
      setWildCardId(card.id);
    } else {
      handlePlayCard(card.id);
    }
  };

  const handleDrawCard = () => {
    if (gameState?.currentTurnId !== socket?.id) return;
    socket?.emit('drawCard', { roomId }, (res: any) => {
      if (!res.success) alert(res.message);
    });
  };

  if (!gameState) return <div className="flex-grow flex items-center justify-center"><p className="text-2xl font-bold animate-pulse">Loading Game State...</p></div>;

  const isMyTurn = gameState.currentTurnId === socket?.id;
  const opponents = gameState.playerStats.filter(p => p.id !== socket?.id);

  if (gameState.winner) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center">
        <h1 className="text-6xl font-black mb-4 text-uno-yellow drop-shadow-lg">GAME OVER</h1>
        <h2 className="text-3xl font-bold mb-8">
          {gameState.winner === socket?.id ? '🎉 You Won! 🎉' : `Player ${gameState.winner.substring(0, 4)} Won!`}
        </h2>
        <button onClick={() => navigate('/')} className="bg-gray-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-700 transition">Return to Home</button>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col justify-between items-center p-4 h-full relative">
      
      {/* Opponents Area */}
      <div className="flex gap-8 justify-center w-full mt-4">
        {opponents.map((opp, idx) => (
          <div key={opp.id} className={`flex flex-col items-center bg-gray-900 px-6 py-4 rounded-xl border-b-4 ${gameState.currentTurnId === opp.id ? 'border-uno-yellow scale-110 shadow-lg shadow-uno-yellow/20' : 'border-gray-700'} transition-all`}>
            <span className="font-bold mb-2">P{idx + 1} ({opp.id.substring(0, 4)})</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-12 bg-uno-red rounded border border-white flex items-center justify-center">
                <span className="text-xs font-bold transform -rotate-12">UNO</span>
              </div>
              <span className="text-2xl font-black text-gray-300">x {opp.cardCount}</span>
            </div>
            {gameState.currentTurnId === opp.id && <span className="text-xs text-uno-yellow font-bold uppercase mt-2">Thinking...</span>}
          </div>
        ))}
      </div>

      {/* Center Table: Draw Pile & Discard Pile */}
      <div className="flex flex-col items-center justify-center gap-8 my-auto relative">
        
        {/* Play Direction Indicator */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -z-10 w-64 h-64 border-4 border-dashed border-gray-700 rounded-full opacity-50 flex items-center justify-center animate-[spin_10s_linear_infinite]" style={{ animationDirection: gameState.playDirection === 1 ? 'normal' : 'reverse' }}>
          <span className="absolute -top-3 bg-uno-darker px-2 text-xl">➤</span>
        </div>

        {/* Current Active Color Banner */}
        <div className="bg-gray-800 px-6 py-2 rounded-full border border-gray-700 shadow-md flex items-center gap-3">
          <span className="font-bold text-gray-400 text-sm uppercase tracking-wider">Active Color</span>
          <div className={`w-6 h-6 rounded-full shadow-inner ${
            gameState.activeColor === 'Red' ? 'bg-uno-red' :
            gameState.activeColor === 'Blue' ? 'bg-uno-blue' :
            gameState.activeColor === 'Green' ? 'bg-uno-green' :
            gameState.activeColor === 'Yellow' ? 'bg-uno-yellow' : 'bg-gray-500'
          }`}></div>
        </div>

        <div className="flex gap-8 sm:gap-16 items-center">
          {/* Draw Pile */}
          <div className="flex flex-col items-center gap-3">
            <UnoCard isFaceDown disabled={!isMyTurn} onClick={handleDrawCard} />
            <span className="font-bold text-gray-400">Draw Pile</span>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center gap-3">
            <UnoCard card={gameState.topCard} disabled />
            <span className="font-bold text-gray-400">Discard Pile</span>
          </div>
        </div>
      </div>

      {/* Local Player Hand Area */}
      <div className="w-full flex flex-col items-center mb-4">
        <div className="flex justify-between items-center w-full max-w-4xl px-4 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black">Your Hand</h3>
            {isMyTurn && <span className="bg-uno-green text-white px-3 py-1 rounded-full text-sm font-bold uppercase animate-pulse shadow-[0_0_10px_#50b848]">Your Turn</span>}
          </div>
          <span className="text-gray-400 font-bold">{gameState.hand.length} Cards</span>
        </div>
        
        {/* Render Hand */}
        <div className="flex flex-wrap justify-center gap-[-2rem] sm:gap-2 px-4 max-w-6xl">
          {gameState.hand.map((card) => (
            <div key={card.id} className="transition-transform hover:-translate-y-4 hover:z-20 -ml-6 sm:ml-0 first:ml-0" style={{ zIndex: 10 }}>
              <UnoCard card={card} disabled={!isMyTurn} onClick={() => handleCardClick(card)} />
            </div>
          ))}
        </div>
      </div>

      {/* Wild Color Picker Modal Overlay */}
      {wildCardId && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700 text-center max-w-sm w-full">
            <h2 className="text-2xl font-black mb-6 text-white">Choose Color</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handlePlayCard(wildCardId, 'Red')} className="h-24 bg-uno-red rounded-xl hover:scale-105 transition shadow-lg border-2 border-transparent hover:border-white"></button>
              <button onClick={() => handlePlayCard(wildCardId, 'Blue')} className="h-24 bg-uno-blue rounded-xl hover:scale-105 transition shadow-lg border-2 border-transparent hover:border-white"></button>
              <button onClick={() => handlePlayCard(wildCardId, 'Green')} className="h-24 bg-uno-green rounded-xl hover:scale-105 transition shadow-lg border-2 border-transparent hover:border-white"></button>
              <button onClick={() => handlePlayCard(wildCardId, 'Yellow')} className="h-24 bg-uno-yellow rounded-xl hover:scale-105 transition shadow-lg border-2 border-transparent hover:border-white"></button>
            </div>
            <button onClick={() => setWildCardId(null)} className="mt-6 text-gray-400 hover:text-white font-bold transition">Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}
