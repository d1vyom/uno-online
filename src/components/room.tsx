"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRoom } from "@/lib/client/use-room";
import { postJson } from "@/lib/client/api";
import type { RoomSnapshot } from "@/lib/server/types";
import { Lobby } from "./lobby";
import { GameTable } from "./game-table";
import { Results } from "./results";
import { Chat } from "./chat";
import { SoundControls } from "./sound-controls";

export function RoomView({ code }: { code: string }) {
  const { snapshot: room, status, pending, error, send, refresh, update } = useRoom(code);
  const [name, setName] = useState(""), [joinError, setJoinError] = useState(""), [joining, setJoining] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { setName(localStorage.getItem("uno-name") ?? ""); }, []);
  useEffect(() => { if (room) localStorage.setItem("uno-room", room.code); }, [room?.code, room]);
  async function join(e: FormEvent) {
    e.preventDefault(); if (joining) return;
    setJoining(true); setJoinError("");
    try { const next = await postJson<RoomSnapshot>("/api/rooms/" + code + "/join", { name }); localStorage.setItem("uno-name", name); update(next); }
    catch (e) { setJoinError(e instanceof Error ? e.message : "Could not join. Please retry."); }
    finally { setJoining(false); }
  }
  if (status === "join") return <main id="main" className="join-view"><span className="eyebrow">YOU’RE INVITED · {code}</span><h1>Join this table.</h1><p>Your friends saved you a seat. What should they call you?</p>
    <form onSubmit={join} className="join-form"><label className="field-label" htmlFor="join-name">Your name</label><input id="join-name" required maxLength={24} autoComplete="nickname" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} /><button className="primary-button" disabled={joining}>{joining ? "Taking your seat…" : "Join the room"} <span aria-hidden="true">→</span></button></form>
    {joinError && <p role="alert" className="form-error">{joinError}</p>}<Link href="/" className="return-link">Back home</Link></main>;
  if (status === "missing") return <main id="main" className="empty-state"><span className="eyebrow">A FRESH START?</span><h1>This table isn’t here.</h1><p>The room has closed or the invite has expired.</p><Link href="/" className="primary-button">Back home</Link></main>;
  if (!room) return <main id="main" className="empty-state" aria-busy={status === "loading"}><div className="loading-mark" /><h1>{status === "reconnecting" ? "The table is out of reach." : "Pulling up a chair."}</h1><p>{status === "reconnecting" ? "The host may still be setting things up. Try again in a moment." : "One moment. We’re getting your seat ready."}</p>{status === "reconnecting" && <button className="primary-button" onClick={() => void refresh()}>Try again</button>}<Link href="/" className="return-link">Back home</Link></main>;
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.origin + "/room/" + code); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setCopied(false); }
  }
  return <main id="main" className="room-main">
    {room.storageMode === "memory" && <div className="development-notice">LOCAL DEVELOPMENT TABLE <span>Rooms last while this server is running.</span></div>}
    <div className="room-toolbar"><div className="room-code-group"><span className="label-small">YOUR PRIVATE TABLE</span><strong data-testid="room-code">{room.code}</strong>
      <button type="button" className="copy-button" aria-label={copied ? "Copied invite link" : "Invite friends — copy invite link"} onClick={() => void copy()}>{copied ? "Copied ✓" : "Invite friends ↗"}</button></div>
      <div className="room-controls"><span className={"connection-status " + (status === "connected" ? "" : "connection-lost")} role="status"><i />{status === "connected" ? "At the table" : "Reconnecting…"}</span><SoundControls room={room} /><button type="button" className="leave-button" disabled={pending} onClick={() => void send({ type: "leave" })}>Leave room <span aria-hidden="true">↗</span></button></div></div>
    {error && <div role="alert" className="action-error">{error}</div>}
    <div className={"room-grid " + (room.phase === "playing" ? "room-grid-playing" : "")}>
      {room.phase === "lobby" ? <Lobby room={room} send={send} pending={pending || status !== "connected"} /> : room.phase === "finished" ? <Results room={room} send={send} pending={pending} /> : <GameTable room={room} send={send} pending={pending || status !== "connected"} />}
      <Chat room={room} send={send} pending={pending || status !== "connected"} />
    </div>
    <div className="room-footer"><span>Keep your cards close. Keep your friends closer.</span><span>2–4 PLAYERS · ALL GOOD COMPANY</span></div>
  </main>;
}
