export default function Home() {
  return (
    <div className="flex-grow flex flex-col items-center justify-center text-center">
      <h1 className="text-5xl font-black mb-8 tracking-wide">
        Welcome to <span className="text-uno-yellow drop-shadow-md">UNO</span> Multiplayer
      </h1>
      
      <p className="text-gray-400 max-w-lg mb-12 text-lg">
        Play the classic card game online with your friends. Create a private room or join an existing game to get started.
      </p>

      <div className="flex gap-6">
        <button className="bg-uno-blue text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-blue-600 hover:scale-105 transition-all shadow-lg hover:shadow-blue-500/25">
          Create Game
        </button>
        <button className="bg-uno-green text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-600 hover:scale-105 transition-all shadow-lg hover:shadow-green-500/25">
          Join Game
        </button>
      </div>
    </div>
  );
}
