import { Card, CardColor, CardValue, GameState, Player } from '../types';

export class UnoEngine {
  private state: GameState;
  private players: Player[];

  constructor(players: Player[]) {
    if (players.length < 2 || players.length > 4) {
      throw new Error("UNO requires 2 to 4 players.");
    }
    
    // Deep copy players to avoid mutating original room state before game starts
    this.players = players.map(p => ({ ...p, hand: [] }));
    this.state = this.initializeGame();
  }

  private initializeGame(): GameState {
    let deck = this.buildDeck();
    deck = this.shuffle(deck);

    // Deal 7 cards to each player
    this.players.forEach(player => {
      player.hand = deck.splice(0, 7);
    });

    // Flip first card for discard pile
    let firstCard = deck.shift()!;
    
    // Ensure the first card isn't a Wild Draw Four (Standard UNO rule)
    while (firstCard.value === 'WildDrawFour') {
      deck.push(firstCard);
      deck = this.shuffle(deck);
      firstCard = deck.shift()!;
    }

    return {
      deck,
      discardPile: [firstCard],
      currentTurnIndex: 0,
      playDirection: 1,
      activeColor: firstCard.color === 'Wild' ? 'Red' : firstCard.color, // Fallback red if Wild is first
      winner: null,
    };
  }

  private buildDeck(): Card[] {
    const colors: CardColor[] = ['Red', 'Blue', 'Green', 'Yellow'];
    const deck: Card[] = [];
    let idCounter = 0;

    for (const color of colors) {
      // One 0 card per color
      deck.push({ id: `c_${idCounter++}`, color, value: '0' });
      
      // Two of each 1-9 and action cards per color
      const values: CardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'DrawTwo'];
      for (const value of values) {
        deck.push({ id: `c_${idCounter++}`, color, value });
        deck.push({ id: `c_${idCounter++}`, color, value });
      }
    }

    // Four Wild and Four Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `c_${idCounter++}`, color: 'Wild', value: 'Wild' });
      deck.push({ id: `c_${idCounter++}`, color: 'Wild', value: 'WildDrawFour' });
    }

    return deck;
  }

  private shuffle(deck: Card[]): Card[] {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  }

  private reshuffleDiscardPile() {
    if (this.state.discardPile.length <= 1) return; // Cannot reshuffle if pile is empty/1

    const topCard = this.state.discardPile.pop()!;
    this.state.deck = this.shuffle(this.state.discardPile);
    this.state.discardPile = [topCard];
  }

  public drawCard(playerId: string): { drawnCard: Card, nextTurn: string } {
    if (this.state.winner) throw new Error("Game is over.");

    const currentPlayer = this.players[this.state.currentTurnIndex];
    if (currentPlayer.id !== playerId) throw new Error("Not your turn.");

    if (this.state.deck.length === 0) {
      this.reshuffleDiscardPile();
    }

    if (this.state.deck.length === 0) {
      throw new Error("Deck is empty and cannot be replenished.");
    }

    const drawnCard = this.state.deck.shift()!;
    currentPlayer.hand!.push(drawnCard);

    // End turn after drawing
    this.nextTurn();
    
    return { 
      drawnCard, 
      nextTurn: this.players[this.state.currentTurnIndex].id 
    };
  }

  public playCard(playerId: string, cardId: string, declaredColor?: CardColor) {
    if (this.state.winner) throw new Error("Game is over.");
    
    const currentPlayer = this.players[this.state.currentTurnIndex];
    if (currentPlayer.id !== playerId) throw new Error("Not your turn.");

    const cardIndex = currentPlayer.hand!.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error("Card not found in hand.");

    const cardToPlay = currentPlayer.hand![cardIndex];

    if (!this.isValidPlay(cardToPlay)) {
      throw new Error("Invalid card play. Does not match color or value.");
    }

    if (cardToPlay.color === 'Wild' && (!declaredColor || declaredColor === 'Wild')) {
      throw new Error("Must declare a valid color when playing a Wild card.");
    }

    // Execute play
    currentPlayer.hand!.splice(cardIndex, 1);
    this.state.discardPile.push(cardToPlay);
    this.state.activeColor = cardToPlay.color === 'Wild' ? declaredColor! : cardToPlay.color;

    this.checkWinner();
    if (this.state.winner) return;

    this.applyCardEffect(cardToPlay);
  }

  private isValidPlay(card: Card): boolean {
    if (card.color === 'Wild') return true;
    
    const topCard = this.state.discardPile[this.state.discardPile.length - 1];
    return card.color === this.state.activeColor || card.value === topCard.value;
  }

  private applyCardEffect(card: Card) {
    let nextPlayerForcedDraw = 0;
    let skipNext = false;

    if (card.value === 'Reverse') {
      this.state.playDirection *= -1;
      if (this.players.length === 2) {
        skipNext = true; // In 2-player UNO, Reverse acts as a Skip
      }
    } else if (card.value === 'Skip') {
      skipNext = true;
    } else if (card.value === 'DrawTwo') {
      nextPlayerForcedDraw = 2;
      skipNext = true;
    } else if (card.value === 'WildDrawFour') {
      nextPlayerForcedDraw = 4;
      skipNext = true;
    }

    if (nextPlayerForcedDraw > 0) {
      const targetIndex = this.getNextPlayerIndex();
      this.drawNCards(targetIndex, nextPlayerForcedDraw);
    }

    this.nextTurn(); // Standard turn advance

    if (skipNext) {
      this.nextTurn(); // Move past the skipped/punished player
    }
  }

  private drawNCards(playerIndex: number, amount: number) {
    const player = this.players[playerIndex];
    for (let i = 0; i < amount; i++) {
      if (this.state.deck.length === 0) {
        this.reshuffleDiscardPile();
      }
      if (this.state.deck.length > 0) {
        player.hand!.push(this.state.deck.shift()!);
      }
    }
  }

  private getNextPlayerIndex(): number {
    const numPlayers = this.players.length;
    return (this.state.currentTurnIndex + this.state.playDirection + numPlayers) % numPlayers;
  }

  private nextTurn() {
    this.state.currentTurnIndex = this.getNextPlayerIndex();
  }

  private checkWinner() {
    const currentPlayer = this.players[this.state.currentTurnIndex];
    if (currentPlayer.hand!.length === 0) {
      this.state.winner = currentPlayer.id;
    }
  }

  public getState(): GameState {
    return this.state;
  }

  public getPlayers(): Player[] {
    return this.players;
  }
}
