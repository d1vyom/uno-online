import { Outlet, Link } from 'react-router-dom';
import { useAudio } from '../contexts/AudioContext';

interface LayoutProps {
  isConnected: boolean;
}

export default function Layout({ isConnected }: LayoutProps) {
  const { volume, setVolume, isMuted, toggleMute } = useAudio();

  return (
    <div className="min-h-screen bg-uno-darker text-white flex flex-col font-sans">
      <nav className="bg-uno-dark px-6 py-4 shadow-lg flex flex-col sm:flex-row justify-between items-center border-b border-gray-700 gap-4 sm:gap-0">
        <Link to="/" className="text-3xl font-black tracking-wider flex gap-1">
          <span className="text-uno-red drop-shadow-md">U</span>
          <span className="text-uno-blue drop-shadow-md">N</span>
          <span className="text-uno-green drop-shadow-md">O</span>
        </Link>
        
        <div className="flex gap-4 sm:gap-6 items-center">
          {/* Audio Controls */}
          <div className="flex items-center gap-3 bg-gray-900 px-4 py-1.5 rounded-full border border-gray-600">
            <button 
              onClick={toggleMute} 
              className="text-lg hover:scale-110 transition-transform"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 sm:w-24 accent-uno-blue cursor-pointer"
              disabled={isMuted}
            />
          </div>

          <Link to="/" className="hover:text-gray-300 font-semibold transition-colors hidden sm:block">
            Home
          </Link>
          
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-full border border-gray-600">
            <div 
              className={`w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] ${
                isConnected ? 'bg-uno-green text-uno-green' : 'bg-uno-red text-uno-red'
              }`}
            ></div>
            <span className="text-sm font-medium hidden sm:block">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>
      </nav>

      <main className="flex-grow p-6 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
