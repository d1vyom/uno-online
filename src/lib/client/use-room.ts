"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoomAction, RoomSnapshot } from "../server/types";
import { acceptSnapshot } from "./room-state";
import { ApiError, postJson, requestJson } from "./api";

export function useRoom(code: string) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "connected" | "reconnecting" | "join" | "missing">("loading");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const current = useRef<RoomSnapshot | null>(null);
  const locked = useRef(false), reading = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const update = useCallback((incoming: RoomSnapshot) => {
    current.current = acceptSnapshot(current.current, incoming);
    setSnapshot(current.current);
    setStatus("connected");
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    abort.current = new AbortController();
    try { update(await requestJson<RoomSnapshot>("/api/rooms/" + code, { signal: abort.current.signal })); }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiError && [401, 403].includes(error.status)) setStatus("join");
      else if (error instanceof ApiError && error.status === 404) setStatus("missing");
      else setStatus("reconnecting");
    } finally { reading.current = false; }
  }, [code, update]);
  const send = useCallback(async (action: RoomAction) => {
    if (locked.current || !current.current) return;
    locked.current = true;
    if (action.type !== "heartbeat") { setPending(true); setError(""); }
    const envelope = { action, expectedRevision: current.current.revision, actionId: crypto.randomUUID() };
    try {
      let result: RoomSnapshot | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { result = await postJson<RoomSnapshot>("/api/rooms/" + code + "/actions", envelope, AbortSignal.timeout(12_000)); break; }
        catch (failure) { if (failure instanceof ApiError || attempt === 1) throw failure; }
      }
      if (result?.left) {
        localStorage.removeItem("uno-room"); router.replace("/"); return;
      }
      if (result) update(result);
    } catch (failure) {
      if (action.type !== "heartbeat") setError(failure instanceof Error ? failure.message : "Connection lost. Try again.");
      await refresh();
    } finally { locked.current = false; setPending(false); }
  }, [code, refresh, router, update]);
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    let delay = 1000;
    async function poll() {
      if (cancelled) return;
      if (!document.hidden) {
        await refresh();
        delay = current.current ? 1000 : Math.min(delay * 1.5, 10_000);
      }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 10_000 : delay);
    }
    function visible() { if (!document.hidden) void refresh(); }
    void poll(); document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; clearTimeout(timer); abort.current?.abort(); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const myId = snapshot?.myId;
  useEffect(() => {
    if (!myId) return;
    void send({ type: "heartbeat" });
    const timer = setInterval(() => { if (!document.hidden) void send({ type: "heartbeat" }); }, 10_000);
    return () => clearInterval(timer);
  }, [myId, send]);
  return { snapshot, status, error, pending, send, refresh, update };
}
