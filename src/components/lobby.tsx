import type { RoomAction, RoomSnapshot } from "@/lib/server/types";
const seatColors = ["seat-red", "seat-blue", "seat-green", "seat-yellow"];
export function Lobby({ room, send, pending }: { room: RoomSnapshot; send: (action: RoomAction) => Promise<void>; pending: boolean }) {
  const me = room.players.find((p) => p.id === room.myId)!;
  const canStart = room.players.length >= 2 && room.players.every((p) => p.ready && p.connected);
  return <section className="lobby-panel">
    <div className="eyebrow"><span className="red-dot" /> THE NIGHT STARTS HERE</div>
    <h1>Your table<br />is waiting.</h1>
    <p className="section-description">Good company makes a great game. Invite your friends,<br className="hidden sm:block" /> get comfortable, and ready up.</p>
    <div className="seat-grid">
      {Array.from({ length: 4 }, (_, i) => {
        const player = room.players[i];
        return <div key={player?.id ?? i} className={"lobby-seat " + (player ? seatColors[i] : "seat-empty")}>
          {player ? <>
            <div className="flex items-start justify-between"><span className="avatar">{player.name.slice(0, 1).toUpperCase()}</span>
              <span className={"seat-status " + (player.ready && player.connected ? "is-ready" : "")}>{!player.connected ? "RECONNECTING" : player.ready ? "READY" : "SETTLING IN"}</span></div>
            <div><h2>{player.name}</h2><span className="seat-caption">{player.id === room.myId ? "YOU" : "PLAYER " + (i + 1)}{player.id === room.hostId && " · HOST"}</span></div>
          </> : <><span className="empty-seat-plus" aria-hidden="true">+</span><div><h2>An open seat.</h2><span className="seat-caption">SAVED FOR A FRIEND</span></div></>}
        </div>;
      })}
    </div>
    <div className="lobby-bottom">
      <div><strong>{room.players.length} of 4 at the table</strong><p>{canStart ? "Everyone is ready. Let’s make it interesting." : "At least two players. Everyone ready. Then we play."}</p></div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={me.ready ? "secondary-button" : "primary-button"} disabled={pending} onClick={() => void send({ type: "ready", ready: !me.ready })}>{me.ready ? "Not ready" : "Ready up"} <span aria-hidden="true">{me.ready ? "✓" : "→"}</span></button>
        {room.hostId === room.myId && <button type="button" className="dark-button" disabled={pending || !canStart} onClick={() => void send({ type: "start" })}>Start the game <span aria-hidden="true">↗</span></button>}
      </div>
    </div>
    {room.hostId !== room.myId && <p className="mt-4 text-xs text-muted">Your host will start once everyone is ready.</p>}
  </section>;
}
