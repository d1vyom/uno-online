"use client";
import { useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "@/lib/server/types";
export function SoundControls({ room }: { room: RoomSnapshot }) {
  const [enabled, setEnabled] = useState(false), [volume, setVolume] = useState(0.35);
  const previous = useRef<RoomSnapshot | null>(null), audio = useRef(new Map<string, HTMLAudioElement>());
  useEffect(() => { setEnabled(localStorage.getItem("uno-sound") === "on"); const stored = Number(localStorage.getItem("uno-volume") ?? "0.35"); if (Number.isFinite(stored)) setVolume(Math.min(1, Math.max(0, stored))); }, []);
  useEffect(() => {
    const old = previous.current; previous.current = room;
    if (!enabled || !old || room.revision === old.revision) return;
    const sound = room.game?.winner && !old.game?.winner ? "victory" : room.game?.topCard.id !== old.game?.topCard.id && old.game ? "play" : room.hand.length > old.hand.length ? "draw" : null;
    if (!sound) return;
    let item = audio.current.get(sound);
    if (!item) { item = new Audio("/sounds/" + sound + ".mp3"); audio.current.set(sound, item); }
    item.volume = volume; item.currentTime = 0; void item.play().catch(() => {});
  }, [room, enabled, volume]);
  return <div className="sound-controls"><button type="button" className="quiet-button" aria-pressed={enabled} aria-label={enabled ? "Sound on — mute sound" : "Sound off — enable sound"} onClick={() => { setEnabled(!enabled); localStorage.setItem("uno-sound", enabled ? "off" : "on"); }}>
    <span aria-hidden="true">{enabled ? "♫" : "♪"}</span><span>Sound {enabled ? "on" : "off"}</span></button>
    {enabled && <input aria-label="Sound volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { const value = Number(e.target.value); setVolume(value); localStorage.setItem("uno-volume", String(value)); }} />}
  </div>;
}
