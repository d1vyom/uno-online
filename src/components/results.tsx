import type { RoomAction, RoomSnapshot } from "@/lib/server/types";
export function Results({ room, send, pending }: { room: RoomSnapshot; send: (action: RoomAction) => Promise<void>; pending: boolean }) {
  const winner = room.players.find((p) => p.id === room.game?.winner), won = winner?.id === room.myId;
  return <section className="results-panel">
    <span className="eyebrow">GOOD GAME. GREAT COMPANY.</span>
    <span className="winner-burst" aria-hidden="true">✳</span>
    <h1>{won ? "That’s your win." : winner?.name + " takes it."}</h1>
    <p>{won ? "A well-played hand. A little well-earned bragging." : "A good rival deserves another round."}</p>
    <div className="score-list">{[...room.players].sort((a, b) => b.wins - a.wins).map((p, i) => <div key={p.id}><span className="score-rank">0{i + 1}</span><strong>{p.name}{p.id === room.myId && <small> YOU</small>}</strong><span>{p.wins} {p.wins === 1 ? "win" : "wins"}</span></div>)}</div>
    {room.hostId === room.myId ? <button type="button" className="primary-button" disabled={pending} onClick={() => void send({ type: "rematch" })}>One more round <span aria-hidden="true">↗</span></button> : <p className="text-sm text-muted">Waiting for your host to start a rematch.</p>}
  </section>;
}
