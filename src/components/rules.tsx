"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
export function Rules({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={compact ? "quiet-button" : "nav-link"} onClick={() => setOpen(true)}>How to play</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="A little refresher.">
      <p className="mt-3 text-sm leading-relaxed text-muted">Seven cards each. Match a color or a symbol. Empty your hand first.</p>
      <ol className="rules-list">
        <li><strong>Make your match.</strong> Play a card matching the active color or the top card's number or action. Wilds change the color.</li>
        <li><strong>Draw, then decide.</strong> Draw one card. If it is playable, play that card or pass. Otherwise your turn ends.</li>
        <li><strong>Shake things up.</strong> Skip misses a turn. Reverse changes direction (and skips in two-player games). +2 and +4 draw cards and skip the next player.</li>
        <li><strong>Call it early.</strong> At two cards, press UNO before your play, or use the “Declare UNO with my next card” switch. Our house rule adds two cards immediately if you forget.</li>
        <li><strong>Keep it fair.</strong> +4 is allowed only with no card of the active color. No stacking, jump-in, or draw-four challenges. Final-card draw penalties still apply.</li>
      </ol>
      <p className="text-xs leading-relaxed text-muted">Private tables for 2–4 friends. Everyone readies up; the host starts. A disconnected seat is held for 90 seconds after its last heartbeat. First out wins the round.</p>
    </Dialog>
  </>;
}
