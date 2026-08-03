import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { ClientGameState, CardColor } from '../types/game';
import UnoCard from '../components/UnoCard';
import ChatBox from '../components/ChatBox';
import { useAudio } from '../contexts/AudioContext';

interface GameProps {
  socket: Socket | null;
  userId: string;
}

export default function Game({ socket, userId }: GameProps) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { playSound } = useAudio();
  
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  const [showUnoAnim, setShowUnoAnim] = useState<string | null>(null);

  const prevTopCardId = useRef<string | null>(null);
  const prevWinner = useRef<string | null>(null);
  const prevTotalCards = useRef<number>(0);

  useEffect(() => {
    if (!gameState) return;

    if (prevTopCardId.current && gameState.topCard.id !== prevTopCardId.current) {
      playSound('play');
    }
    prevTopCardId.current = gameState.topCard.id;

    const currentTotal = gameState.playerStats.reduce((sum, p) => sum + p.cardCount, 0);
    if (prevTotalCards.current && currentTotal > prevTotalCards.current) {
      playSound('draw');
    }
    prevTotalCards.current = currentTotal;

    if (gameState.winner && gameState.winner !== prevWinner.current) {
      playSound('victory');
      prevWinner.current = gameState.winner;
    }
  }, [gameState, playSound]);

  useEffect(() => {
    if (!socket) {
      navigate('/');
      return;
    }

    const handleStateUpdate = (state: ClientGameState) => setGameState(state);
    
    socket.on('gameStateUpdate', handleStateUpdate);
    
    socket.on('unoCalled', ({ playerId }) => {
      playSound('uno');
      setShowUnoAnim(playerId);
      setTimeout(() => setShowUnoAnim(null), 2500);
    });

    return () => {
      socket.off('gameStateUpdate', handleStateUpdate);
      socket.off('unoCalled');
    };
  }, [socket, navigate, playSound]);

  const handlePlayCard = (cardId: string, declaredColor?: CardColor) => {
    socket?.emit('playCard', { roomId, cardId, declaredColor }, (res: any) => {
      if (!res.success) alert(res.message); 
    });
    setWildCardId(null);
  };

  const handleCardClick = (card: any) => {
    if (gameState?.currentTurnId !== userId) return;
    
    if (card.color === 'Wild') {
      setWildCardId(card.id);
    } else {
      handlePlayCard(card.id);
    }
  };

  const handleDrawCard = () => {
    if (gameState?.currentTurnId !== userId) return;
    socket?.emit('drawCard', { roomId }, (res: any) => {
      if (!res.success) alert(res.message);
    });
  };

  const handleCallUno = () => {
    socket?.emit('callUno', { roomId }, (res: any) => {
      if (!res.success) alert(res.message);
    });
  };

  if (!gameState) return <div className="flex-grow flex items-center justify-center"><p className="text-2xl font-bold animate-pulse">Loading Game State...</p></div>;

  const isMyTurn = gameState.currentTurnId === userId;
  const opponents = gameState.playerStats.filter(p => p.id !== userId);
  const myStats = gameState.playerStats.find(p => p.id === userId);
  const canCallUno = gameState.hand.length <= 2;
  const hasCalledUno = myStats?.calledUno;

  if (gameState.winner) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden">
        <motion.div 
          initial={{ scale: 0, opacity: 0, rotate: -180 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 100 }}
          className="flex flex-col items-center"
        >
          <h1 className="text-6xl font-black mb-4 text-uno-yellow drop-shadow-lg">GAME OVER</h1>
          <h2 className="text-3xl font-bold mb-8 text-white">
            {gameState.winner === userId ? '🎉 You Won! 🎉' : `Player ${gameState.winner.substring(0, 4)} Won!`}
          </h2>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/')} 
            className="bg-gray-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-700 transition shadow-xl"
          >
            Return to Home
          </motion.button>
        </motion.div>
        
        {/* Chat box remains accessible in Game Over screen */}
        <ChatBox socket={socket} roomId={roomId!} userId={userId} />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col justify-between items-center p-4 h-full relative overflow-hidden">
      
      <AnimatePresence>
        {showUnoAnim && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm"
          >
            <motion.span 
              animate={{ y: [0, -20, 0] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-8xl md:text-[12rem] font-black text-uno-red drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] italic tracking-tighter"
            >
              UNO!
            </motion.span>
            <span className="text-3xl md:text-5xl text-white font-bold mt-8 bg-gray-900/80 px-8 py-4 rounded-full border-4 border-uno-red shadow-2xl">
              {showUnoAnim === userId ? "You" : `Player ${showUnoAnim.substring(0, 4)}`} called UNO!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-8 justify-center w-full mt-4">
        {opponents.map((opp, idx) => (
          <div key={opp.id} className={`flex flex-col items-center bg-gray-900 px-6 py-4 rounded-xl border-b-4 ${gameState.currentTurnId === opp.id ? 'border-uno-yellow scale-110 shadow-lg shadow-uno-yellow/20' : 'border-gray-700'} transition-all ${!opp.isConnected && 'opacity-50'}`}>
            <span className="font-bold mb-2">P{idx + 1} ({opp.id.substring(0, 4)})</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-12 bg-uno-red rounded border border-white flex items-center justify-center">
                <span className="text-xs font-bold transform -rotate-12">UNO</span>
              </div>
              <span className="text-2xl font-black text-gray-300">x {opp.cardCount}</span>
            </div>
            {opp.calledUno && <span className="bg-uno-red text-white text-[10px] px-2 py-0.5 rounded-full font-black mt-1 uppercase animate-pulse shadow-md">UNO!</span>}
            {gameState.currentTurnId === opp.id && opp.isConnected && <span className="text-xs text-uno-yellow font-bold uppercase mt-2">Thinking...</span>}
            {!opp.isConnected && <span className="text-xs text-uno-red font-bold animate-pulse mt-2">Reconnecting...</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-center gap-8 my-auto relative">
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -z-10 w-64 h-64 border-4 border-dashed border-gray-700 rounded-full opacity-50 flex items-center justify-center animate-[spin_10s_linear_infinite]" style={{ animationDirection: gameState.playDirection === 1 ? 'normal' : 'reverse' }}>
          <span className="absolute -top-3 bg-uno-darker px-2 text-xl">➤</span>
        </div>

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
          <div className="flex flex-col items-center gap-3">
            <UnoCard isFaceDown disabled={!isMyTurn} onClick={handleDrawCard} />
            <span className="font-bold text-gray-400">Draw Pile</span>
          </div>

          <div className="flex flex-col items-center gap-3 relative w-24 h-36 sm:w-32 sm:h-48">
            <AnimatePresence mode="popLayout">
              <motion.div 
                key={gameState.topCard.id}
                initial={{ scale: 2, opacity: 0, rotate: -20, y: -50 }}
                animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
                transition={{ type: 'spring', damping: 14, stiffness: 120 }}
                className="absolute inset-0"
              >
                <UnoCard card={gameState.topCard} disabled />
              </motion.div>
            </AnimatePresence>
            <span className="absolute -bottom-8 font-bold text-gray-400 w-full text-center">Discard Pile</span>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-center mb-4">
        <div className="flex justify-between items-center w-full max-w-4xl px-4 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black">Your Hand</h3>
            {isMyTurn && <span className="bg-uno-green text-white px-3 py-1 rounded-full text-sm font-bold uppercase animate-pulse shadow-[0_0_10px_#50b848]">Your Turn</span>}
            {hasCalledUno && <span className="bg-uno-red text-white px-3 py-1 rounded-full text-sm font-bold uppercase shadow-md">UNO Called</span>}
          </div>
          
          <div className="flex items-center gap-6">
            <motion.button 
              whileHover={canCallUno && !hasCalledUno ? { scale: 1.1 } : {}}
              whileTap={canCallUno && !hasCalledUno ? { scale: 0.95 } : {}}
              onClick={handleCallUno}
              disabled={!canCallUno || hasCalledUno}
              className={`px-6 py-2 rounded-xl font-black text-xl transition-all shadow-lg border-2 ${
                canCallUno && !hasCalledUno
                  ? 'bg-uno-red text-white border-white shadow-red-500/50' 
                  : 'bg-gray-800 text-gray-600 border-gray-700 cursor-not-allowed opacity-50'
              }`}
            >
              UNO!
            </motion.button>
            <span className="text-gray-400 font-bold">{gameState.hand.length} Cards</span>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-[-2rem] sm:gap-2 px-4 max-w-6xl">
          <AnimatePresence mode="popLayout">
            {gameState.hand.map((card, idx) => (
              <div key={card.id} className="-ml-6 sm:ml-0 first:ml-0 relative">
                <UnoCard 
                  card={card} 
                  index={idx}
                  disabled={!isMyTurn} 
                  onClick={() => handleCardClick(card)} 
                />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {wildCardId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-50"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              className="bg-gray-800 p-8 rounded-3xl border border-gray-700 text-center max-w-sm w-full"
            >
              <h2 className="text-2xl font-black mb-6 text-white">Choose Color</h2>
              <div className="grid grid-cols-2 gap-4">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handlePlayCard(wildCardId, 'Red')} className="h-24 bg-uno-red rounded-xl shadow-lg border-2 border-transparent hover:border-white"></motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handlePlayCard(wildCardId, 'Blue')} className="h-24 bg-uno-blue rounded-xl shadow-lg border-2 border-transparent hover:border-white"></motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handlePlayCard(wildCardId, 'Green')} className="h-24 bg-uno-green rounded-xl shadow-lg border-2 border-transparent hover:border-white"></motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handlePlayCard(wildCardId, 'Yellow')} className="h-24 bg-uno-yellow rounded-xl shadow-lg border-2 border-transparent hover:border-white"></motion.button>
              </div>
              <button onClick={() => setWildCardId(null)} className="mt-6 text-gray-400 hover:text-white font-bold transition">Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Box Integration */}
      <ChatBox socket={socket} roomId={roomId!} userId={userId} />
    </div>
  );
}
