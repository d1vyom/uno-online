"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postJson } from "@/lib/client/api";
import type { RoomSnapshot } from "@/lib/server/types";
import { CardFace } from "./card";

export function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(""), [code, setCode] = useState("");
  const [error, setError] = useState(""), [pending, setPending] = useState(false), [previous, setPrevious] = useState("");
  useEffect(() => { setName(localStorage.getItem("uno-name") ?? ""); setPrevious(localStorage.getItem("uno-room") ?? ""); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (pending) return;
    setPending(true); setError("");
    try {
      const room = await postJson<RoomSnapshot>(mode === "create" ? "/api/rooms" : "/api/rooms/" + code.trim().toUpperCase() + "/join", { name });
      localStorage.setItem("uno-name", name.trim()); localStorage.setItem("uno-room", room.code);
      router.push("/room/" + room.code);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not reach the table. Please try again."); setPending(false); }
  }
  return <main id="main" className="home-main">
    <section className="home-hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="red-dot" /> LESS SCROLLING. MORE PLAYING.</div>
        <h1>Good friends.<br /><span>Great rivalries.</span></h1>
        <p className="hero-description">Your favorite card-night chaos, now one link away.<br className="hidden md:block" /> Bring your people. We’ll deal the cards.</p>
        <div className="play-panel">
          <div role="tablist" aria-label="Choose how to play" className="play-tabs">
            <button type="button" role="tab" aria-selected={mode === "create"} aria-controls="play-form" id="create-tab" tabIndex={mode === "create" ? 0 : -1}
              onKeyDown={(e) => { if (e.key === "ArrowRight") { setMode("join"); document.getElementById("join-tab")?.focus(); } }}
              onClick={() => { setMode("create"); setError(""); }}>Host a table <span>↗</span></button>
            <button type="button" role="tab" aria-selected={mode === "join"} aria-controls="play-form" id="join-tab" tabIndex={mode === "join" ? 0 : -1}
              onKeyDown={(e) => { if (e.key === "ArrowLeft") { setMode("create"); document.getElementById("create-tab")?.focus(); } }}
              onClick={() => { setMode("join"); setError(""); }}>Join friends <span>↗</span></button>
          </div>
          <div id="play-form" role="tabpanel" aria-labelledby={mode === "create" ? "create-tab" : "join-tab"}><form onSubmit={submit}>
            <label className="field-label" htmlFor="home-name">Your name</label>
            <div className="home-form-row">
              <input id="home-name" autoComplete="nickname" placeholder="What should we call you?" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} required disabled={pending} />
              {mode === "join" && <input aria-label="Room code" autoCapitalize="characters" placeholder="ABC234" pattern="[A-Za-z2-9]{6}" minLength={6} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="code-input" required disabled={pending} />}
              <button type="submit" className="primary-button" disabled={pending}>{pending ? "Dealing…" : mode === "create" ? "Create a room" : "Join the room"} <span aria-hidden="true">→</span></button>
            </div>
            {error && <p role="alert" className="form-error">{error}</p>}
            <div className="form-footnote"><span aria-hidden="true">✓</span> No sign-up. No downloads. Just good company.</div>
          </form></div>
        </div>
        {previous && <Link href={"/room/" + previous} className="return-link">Your last table is {previous}. Jump back in <span aria-hidden="true">↗</span></Link>}
      </div>
      <div className="hero-art" aria-label="A playful fan of colorful cards" role="img">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">+</span>
        <span className="art-small-label">THE GROUP CHAT<br />HAS MET ITS MATCH.</span>
        <div className="hero-card hero-card-blue"><CardFace card={{ id: "hero-blue", color: "blue", value: "reverse" }} /></div>
        <div className="hero-card hero-card-yellow"><CardFace card={{ id: "hero-yellow", color: "yellow", value: "7" }} /></div>
        <div className="hero-card hero-card-red"><CardFace card={{ id: "hero-red", color: "red", value: "draw2" }} /></div>
        <div className="art-sticker"><span>ONE MORE</span><strong>ROUND?</strong><span>YEAH, THOUGHT SO.</span></div>
        <div className="art-note"><span className="mini-avatars"><i>A</i><i>B</i><i>C</i><i>+</i></span><span>2–4 friends.<br /><strong>Endless “last games.”</strong></span></div>
      </div>
    </section>
    <section className="how-strip" aria-label="Three steps to game night">
      <div className="strip-intro">GAME NIGHT.<br /><strong>MINUS THE PLANNING.</strong></div>
      {[["01", "Make a little room.", "Open a private table in seconds."], ["02", "Send the group a link.", "Your friends, your table. Four seats."], ["03", "Let the chaos begin.", "Match, reverse, and call that UNO."]].map(([number, title, description]) =>
        <div key={number} className="strip-step"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>)}
    </section>
  </main>;
}
