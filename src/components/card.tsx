import type { Card } from "@/lib/game/types";
const values: Record<string, string> = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "✳", draw4: "+4" };
const spoken: Record<string, string> = { skip: "skip", reverse: "reverse", draw2: "draw two", wild: "wild", draw4: "wild draw four" };
export function cardLabel(card: Card) { return (card.color === "wild" ? "" : card.color + " ") + (spoken[card.value] ?? card.value); }
export function CardFace({ card, back = false, className = "" }: { card?: Card; back?: boolean; className?: string }) {
  const value = card ? values[card.value] ?? card.value : "";
  return <span aria-hidden="true" className={"playing-card " + (back || !card ? "card-back" : "card-" + card.color) + " " + className}>
    {back || !card ? <><span className="card-back-orbit" /><span className="card-back-word">UNO{" "}<span>ONLINE</span></span></> :
      <><span className="card-corner" data-value={value} /><span className="card-oval"><span>{value}</span></span><span className="card-corner card-corner-bottom" data-value={value} /></>}
  </span>;
}
export function CardButton({ card, disabled, onClick }: { card: Card; disabled: boolean; onClick: () => void }) {
  return <button type="button" data-testid="hand-card" data-card-id={card.id} className="hand-card" disabled={disabled} onClick={onClick} aria-label={"Play " + cardLabel(card) + (values[card.value] ? " — " + values[card.value] : "")}>
    <CardFace card={card} />
  </button>;
}
