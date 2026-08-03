import { Card } from '../types/game';

interface UnoCardProps {
  card?: Card;
  onClick?: () => void;
  disabled?: boolean;
  isFaceDown?: boolean;
}

export default function UnoCard({ card, onClick, disabled, isFaceDown }: UnoCardProps) {
  if (isFaceDown || !card) {
    return (
      <div 
        onClick={!disabled ? onClick : undefined}
        className={`w-24 h-36 sm:w-32 sm:h-48 rounded-xl border-4 border-white bg-gray-900 flex items-center justify-center shadow-lg transform transition-transform ${!disabled && 'hover:-translate-y-2 cursor-pointer'}`}
      >
        <div className="bg-uno-red text-white w-20 h-28 sm:w-28 sm:h-40 rounded-lg flex items-center justify-center border-2 border-white transform -rotate-12">
          <span className="text-3xl sm:text-4xl font-black italic tracking-tighter drop-shadow-md">UNO</span>
        </div>
      </div>
    );
  }

  const bgColors: Record<string, string> = {
    Red: 'bg-uno-red',
    Blue: 'bg-uno-blue',
    Green: 'bg-uno-green',
    Yellow: 'bg-uno-yellow',
    Wild: 'bg-gray-800'
  };

  const textColors: Record<string, string> = {
    Red: 'text-uno-red',
    Blue: 'text-uno-blue',
    Green: 'text-uno-green',
    Yellow: 'text-uno-yellow',
    Wild: 'text-gray-900'
  };

  const displayValue = () => {
    switch (card.value) {
      case 'Skip': return '⊘';
      case 'Reverse': return '⇄';
      case 'DrawTwo': return '+2';
      case 'Wild': return 'WILD';
      case 'WildDrawFour': return '+4';
      default: return card.value;
    }
  };

  return (
    <div 
      onClick={!disabled ? onClick : undefined}
      className={`w-24 h-36 sm:w-32 sm:h-48 rounded-xl border-4 border-white ${bgColors[card.color]} flex flex-col items-center justify-between p-2 shadow-lg transform transition-transform ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-6 cursor-pointer hover:shadow-2xl hover:z-10 relative'}`}
    >
      <div className="w-full text-left text-white font-bold text-lg sm:text-xl leading-none drop-shadow-md">{displayValue()}</div>
      
      <div className="bg-white w-16 h-24 sm:w-20 sm:h-32 rounded-full flex items-center justify-center shadow-inner transform -rotate-12">
        <span className={`text-4xl sm:text-5xl font-black ${textColors[card.color]} drop-shadow-sm`}>
          {displayValue()}
        </span>
      </div>
      
      <div className="w-full text-right text-white font-bold text-lg sm:text-xl leading-none transform rotate-180 drop-shadow-md">{displayValue()}</div>
    </div>
  );
}
