export type CardColor = 'Red' | 'Blue' | 'Green' | 'Yellow' | 'Wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'Skip' | 'Reverse' | 'DrawTwo' | 'Wild' | 'WildDrawFour';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface PlayerStats {
  id: string;
  cardCount: number;
  calledUno: boolean; // Tracking UNO call status
}

export interface ClientGameState {
  topCard: Card;
  activeColor: CardColor;
  currentTurnId: string;
  playDirection: number;
  winner: string | null;
  hand: Card[];
  playerStats: PlayerStats[];
}
