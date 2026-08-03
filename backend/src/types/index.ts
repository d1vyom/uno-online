export type CardColor = 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'Skip' | 'Reverse' | 'DrawTwo' | 'Wild' | 'WildDrawFour';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface Player {
  id: string;
  hand?: Card[];
  calledUno?: boolean;
  isConnected?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  currentTurnIndex: number;
  playDirection: number;
  activeColor: CardColor;
  winner: string | null;
}

export interface Room {
  id: string;
  hostId: string;
  players: Player[];
  chatHistory: ChatMessage[];
  gameState?: GameState;
}
