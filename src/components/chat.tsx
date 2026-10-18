"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomAction, RoomSnapshot } from "@/lib/server/types";
export function Chat({ room, send, pending }: { room: RoomSnapshot; send: (action: RoomAction) => Promise<void>; pending: boolean }) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [room.chat.length]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!text.trim() || pending) return;
    const message = text; setText(""); await send({ type: "chat", text: message });
  }
  return <aside className="chat-panel" aria-label="Room chat">
    <div className="chat-heading"><h2>Table talk<span>.</span></h2><span className="label-small">KEEP IT FRIENDLY</span></div>
    <div className="chat-messages" role="log" aria-label="Chat messages" aria-relevant="additions">
      {!room.chat.length && <div className="chat-empty"><span aria-hidden="true">“</span><p>The best games come<br />with a little banter.</p><small>Say hello to your table.</small></div>}
      {room.chat.map((message) => <div key={message.id} className={"chat-message " + (message.playerId === room.myId ? "is-mine" : "")}>
        <span>{message.playerId === room.myId ? "You" : message.name}</span><p>{message.text}</p></div>)}
      <div ref={bottom} />
    </div>
    <form onSubmit={submit} className="chat-form">
      <input aria-label="Chat message" placeholder={room.phase === "finished" ? "Ready for a rematch?" : "Say something nice…"} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} disabled={room.phase === "finished"} />
      <button type="submit" className="chat-send" aria-label="Send message" disabled={pending || !text.trim() || room.phase === "finished"}>↑</button>
    </form>
    <div className="recent-actions"><span className="label-small">AT THE TABLE</span>{room.events.slice(-3).reverse().map((event) => <p key={event.id}>{event.text}</p>)}</div>
  </aside>;
}
