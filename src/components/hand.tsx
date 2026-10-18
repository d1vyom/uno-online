"use client";
import { useState } from "react";
import type { Card, Color } from "@/lib/game/types";
import { COLORS } from "@/lib/game/types";
import type { RoomAction, RoomSnapshot } from "@/lib/server/types";
import { CardButton } from "./card";
import { Dialog } from "./dialog";
export function Hand({ room, send, pending }: { room: RoomSnapshot; send: (action: RoomAction) => Promise<void>; pending: boolean }) {
  const [sort, setSort] = useState("color"), [wild, setWild] = useState<Card | null>(null), [declare, setDeclare] = useState(false);
  const me = room.players.find((p) => p.id === room.myId)!;
  const turn = room.game?.currentPlayerId === room.myId;
  const ordered = [...room.hand].sort((a, b) => sort === "color" ? a.color.localeCompare(b.color) || a.value.localeCompare(b.value, undefined, { numeric: true }) : a.value.localeCompare(b.value, undefined, { numeric: true }) || a.color.localeCompare(b.color));
  function play(card: Card, color?: Color) {
    setWild(null);
    void send({ type: "play", cardId: card.id, ...(color ? { color } : {}), ...(declare ? { uno: true } : {}) });
  }
  return <section className="hand-panel" aria-label="Your hand">
    <div className="hand-heading"><div className="flex items-center gap-3"><h2>Your hand</h2><span className="hand-count">{room.hand.length} cards</span>{me.uno && <span className="uno-tag">UNO!</span>}</div>
      <label className="sort-label">Sort <select aria-label="Sort your hand" value={sort} onChange={(e) => setSort(e.target.value)}><option value="color">By color</option><option value="value">By value</option></select></label></div>
    <div className="hand-scroll" data-testid="hand">
      {ordered.map((card) => <CardButton key={card.id} card={card} disabled={pending || !turn || !room.legalCardIds.includes(card.id)} onClick={() => card.color === "wild" ? setWild(card) : play(card)} />)}
    </div>
    <div className="hand-footer"><p>{turn ? room.game?.canPass ? "Play the card you drew, or pass." : "The highlighted cards are yours to play." : "A little patience. Your moment is coming."}</p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {turn && room.hand.length === 2 && !me.uno && <label className="uno-switch"><input type="checkbox" checked={declare} onChange={(e) => setDeclare(e.target.checked)} />Declare UNO with my next card</label>}
        <button type="button" className="uno-button" disabled={pending || !turn || room.hand.length !== 2 || me.uno} onClick={() => void send({ type: "uno" })}>UNO!</button>
      </div></div>
    <Dialog open={!!wild} onClose={() => setWild(null)} title="Your wild. Your color.">
      <p className="mt-3 text-sm text-muted">Pick the color for the next play.</p>
      <div className="color-options">{COLORS.map((color) => <button type="button" key={color} aria-label={"Choose " + color} className={"color-option color-" + color} onClick={() => { if (wild) play(wild, color); }}>{color}<span aria-hidden="true">↗</span></button>)}</div>
    </Dialog>
  </section>;
}
