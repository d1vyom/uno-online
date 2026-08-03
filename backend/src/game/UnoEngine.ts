import { Card, CardColor, CardValue, GameState, Player } from '../types';

export class UnoEngine {
  private state: GameState;
  private players: Player[];

  constructor(players: Player[]) {
    if (players.length < 2 || players.length > 4) {
      throw new Error("UNO requires 2 to 4 players.");
    }
    
    this.players = players.map(p => ({ ...p, hand: [], calledUno: false }));
    this.state = this.initializeGame();
  }

  private initializeGame(): GameState {
    let deck = this.buildDeck();
    deck = this.shuffle(deck);

    this.players.forEach(player => {
      player.hand = deck.splice(0, 7);
    });

    let firstCard = deck.shift()!;
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
      activeColor: firstCard.color === 'Wild' ? 'Red' : firstCard.color,
      winner: null,
    };
  }

  private buildDeck(): Card[] {
    const colors: CardColor[] = ['Red', 'Blue', 'Green', 'Yellow'];
    const deck: Card[] = [];
    let idCounter = 0;

    for (const color of colors) {
      deck.push({ id: `c_${idCounter++}`, color, value: '0' });
      const values: CardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'DrawTwo'];
      for (const value of values) {
        deck.push({ id: `c_${idCounter++}`, color, value });
        deck.push({ id: `c_${idCounter++}`, color, value });
      }
    }

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

  private reshuffleDiscardPile(): boolean {
    if (this.state.discardPile.length <= 1) return false;

    const topCard = this.state.discardPile.pop()!;
    this.state.deck = this.shuffle(this.state.discardPile);
    this.state.discardPile = [topCard];
    return true;
  }

  public drawCard(playerId: string): { drawnCard: Card, nextTurn: string } {
    if (this.state.winner) throw new Error("Game is over.");

    const currentPlayer = this.players[this.state.currentTurnIndex];
    if (currentPlayer.id !== playerId) throw new Error("Not your turn.");

    if (this.state.deck.length === 0) {
      this.reshuffleDiscardPile();
    }
    
    if (this.state.deck.length === 0) {
      // Safe fallback if deck and discard pile are completely exhausted
      this.nextTurn();
      return { 
        drawnCard: { id: 'empty', color: 'Wild', value: '0' }, 
        nextTurn: this.players[this.state.currentTurnIndex].id 
      };
    }

    const drawnCard = this.state.deck.shift()!;
    currentPlayer.hand!.push(drawnCard);
    
    // Reset UNO declaration status whenever cards are added to hand
    currentPlayer.calledUno = false;

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

    currentPlayer.hand!.splice(cardIndex, 1);
    this.state.discardPile.push(cardToPlay);
    this.state.activeColor = cardToPlay.color === 'Wild' ? declaredColor! : cardToPlay.color;

    this.checkWinner();
    if (this.state.winner) return;

    // Penalty check: failing to call UNO before playing 2nd-to-last card
    if (currentPlayer.hand!.length === 1) {
      if (!currentPlayer.calledUno) {
        this.drawNCards(this.state.currentTurnIndex, 2);
      }
    } else {
      currentPlayer.calledUno = false; 
    }

    this.applyCardEffect(cardToPlay);
  }

  public callUno(playerId: string) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new Error("Player not found.");
    
    if (player.hand!.length > 2) {
      throw new Error("You can only call UNO when you have 2 or fewer cards.");
    }
    
    player.calledUno = true;
  }

  public removePlayer(playerId: string): { gameEnded: boolean; winner: string | null } {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return { gameEnded: !!this.state.winner, winner: this.state.winner };

    const [removedPlayer] = this.players.splice(index, 1);
    
    // Recycle removed player's hand back into the deck
    if (removedPlayer.hand && removedPlayer.hand.length > 0) {
      this.state.deck.push(...removedPlayer.hand);
      this.state.deck = this.shuffle(this.state.deck);
    }

    if (this.players.length < 2) {
      this.state.winner = this.players.length === 1 ? this.players[0].id : null;
      return { gameEnded: true, winner: this.state.winner };
    }

    if (index < this.state.currentTurnIndex) {
      this.state.currentTurnIndex--;
    } else if (this.state.currentTurnIndex >= this.players.length) {
      this.state.currentTurnIndex = 0;
    }

    return { gameEnded: false, winner: null };
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
      if (this.players.length === 2) skipNext = true;
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

    this.nextTurn();
    if (skipNext) this.nextTurn();
  }

  private drawNCards(playerIndex: number, amount: number) {
    const player = this.players[playerIndex];
    if (!player) return;

    for (let i = 0; i < amount; i++) {
      if (this.state.deck.length === 0) this.reshuffleDiscardPile();
      if (this.state.deck.length > 0) player.hand!.push(this.state.deck.shift()!);
    }
    
    // Drawing cards always resets UNO state
    player.calledUno = false;
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
    if (currentPlayer && currentPlayer.hand!.length === 0) {
      this.state.winner = currentPlayer.id;
    }
  }

  public getState(): GameState { return this.state; }
  public getPlayers(): Player[] { return this.players; }
}
