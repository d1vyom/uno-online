export interface Player {
  id: string;
}

export interface Room {
  id: string;
  hostId: string;
  players: Player[];
}
