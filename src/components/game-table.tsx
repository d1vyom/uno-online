import type { RoomAction, RoomSnapshot } from "@/lib/server/types";
import { CardFace } from "./card";
import { Hand } from "./hand";
export function GameTable({ room, send, pending }: { room: RoomSnapshot; send: (action: RoomAction) => Promise<void>; pending: boolean }) {
  const game = room.game!;
  const myTurn = game.currentPlayerId === room.myId;
  const current = room.players.find((p) => p.id === game.currentPlayerId);
  const myIndex = room.players.findIndex((p) => p.id === room.myId);
  const opponents = [...room.players.slice(myIndex + 1), ...room.players.slice(0, myIndex)];
  return <section className="game-section">
    <div className="game-title"><div><span className="eyebrow">A LITTLE FRIENDLY COMPETITION</span><h1>{!current?.connected ? "Holding a seat." : myTurn ? "Your move." : current?.name + " is up."}</h1></div>
      <span className="round-badge">ROUND IN PLAY <span className="live-dot" /></span></div>
    <div className="game-table">
      <div className="table-watermark" aria-hidden="true">UNO<span>MAKE IT A GOOD ONE.</span></div>
      <div className="opponent-seats">{opponents.map((opponent, i) => <div key={opponent.id} className={"opponent opponent-" + i + (opponent.id === game.currentPlayerId ? " opponent-active" : "")}>
        <div className="opponent-avatar">{opponent.name.slice(0, 1).toUpperCase()}</div>
        <div><strong>{opponent.name}</strong><span>{!opponent.connected ? "Reconnecting…" : opponent.id === game.currentPlayerId ? "Their move" : opponent.uno ? "UNO!" : "At the table"}</span></div>
        <div className="opponent-count"><span className="tiny-card" aria-hidden="true" />{opponent.cardCount}<span className="sr-only"> cards</span></div>
      </div>)}</div>
      <div className="table-center">
        <span className="table-direction">{game.direction === 1 ? "↻" : "↺"} <span>{game.direction === 1 ? "CLOCKWISE" : "COUNTERCLOCKWISE"}</span></span>
        <div className="pile-row">
          <div className="pile"><button type="button" className="draw-pile" aria-label="Draw a card — UNO ONLINE" disabled={pending || !myTurn || game.canPass || !current?.connected} onClick={() => void send({ type: "draw" })}><CardFace back /></button><span>DRAW PILE</span></div>
          <span className="pile-divider" aria-hidden="true">→</span>
          <div className="pile"><CardFace card={game.topCard} className="discard-card" /><span>LAST PLAYED</span></div>
        </div>
        <div className={"active-color active-" + game.activeColor}><i /><span>{game.activeColor} to play</span></div>
        <div className="table-turn" role="status" aria-live="polite">{!current?.connected ? "Waiting for " + current?.name + " to reconnect…" : myTurn ? "Make your move. You’ve got this." : "Waiting for " + current?.name + "…"}</div>
        {myTurn && game.canPass && <button type="button" className="table-pass" disabled={pending} onClick={() => void send({ type: "pass" })}>Pass this turn →</button>}
      </div>
      <span className="table-corner-note">PLAY YOUR CARDS RIGHT.</span>
    </div>
    <Hand room={room} send={send} pending={pending} />
  </section>;
}
