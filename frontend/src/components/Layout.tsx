import { Outlet, Link } from 'react-router-dom';

interface LayoutProps {
  isConnected: boolean;
}

export default function Layout({ isConnected }: LayoutProps) {
  return (
    <div className="min-h-screen bg-uno-darker text-white flex flex-col font-sans">
      <nav className="bg-uno-dark px-6 py-4 shadow-lg flex justify-between items-center border-b border-gray-700">
        <Link to="/" className="text-3xl font-black tracking-wider flex gap-1">
          <span className="text-uno-red drop-shadow-md">U</span>
          <span className="text-uno-blue drop-shadow-md">N</span>
          <span className="text-uno-green drop-shadow-md">O</span>
        </Link>
        
        <div className="flex gap-6 items-center">
          <Link to="/" className="hover:text-gray-300 font-semibold transition-colors">
            Home
          </Link>
          
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-full border border-gray-600">
            <div 
              className={`w-3 h-3 rounded-full shadow-[0_0_8px_currentColor] ${
                isConnected ? 'bg-uno-green text-uno-green' : 'bg-uno-red text-uno-red'
              }`}
            ></div>
            <span className="text-sm font-medium">
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
