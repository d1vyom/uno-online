import { createClient } from "@supabase/supabase-js";
import { createSupabaseStore } from "./supabase-store";
import { ServiceError, type Room, type RoomStore } from "./types";
const TTL = 86_400_000;

export function createMemoryStore(clock = Date.now): RoomStore {
  const rooms = new Map<string, { room: Room; expires: number }>();
  const memberships = new Map<string, string>();
  const limits = new Map<string, { count: number; expires: number }>();
  function read(code: string): Room | null {
    const entry = rooms.get(code);
    if (!entry) return null;
    if (entry.expires <= clock()) { rooms.delete(code); return null; }
    return structuredClone(entry.room);
  }
  function active(sessionHash: string): string | null {
    const code = memberships.get(sessionHash);
    if (!code) return null;
    if (read(code)?.players.some((p) => p.sessionHash === sessionHash)) return code;
    memberships.delete(sessionHash); return null;
  }
  return {
    mode: "memory",
    async read(code) { return read(code); },
    async activeRoom(hash) { return active(hash); },
    async create(room, hash) {
      if (read(room.code) || active(hash)) return false;
      rooms.set(room.code, { room: structuredClone(room), expires: clock() + TTL });
      memberships.set(hash, room.code); return true;
    },
    async commit(previousRevision, room, membership = {}) {
      if (read(room.code)?.revision !== previousRevision) return false;
      if (membership.add && active(membership.add) && active(membership.add) !== room.code) return false;
      for (const hash of membership.remove ?? []) if (memberships.get(hash) === room.code) memberships.delete(hash);
      if (membership.add) memberships.set(membership.add, room.code);
      if (!room.players.length) rooms.delete(room.code);
      else rooms.set(room.code, { room: structuredClone(room), expires: clock() + TTL });
      return true;
    },
    async consumeLimit(key, maximum, windowSeconds) {
      const old = limits.get(key);
      const entry = old && old.expires > clock() ? old : { count: 0, expires: clock() + windowSeconds * 1000 };
      entry.count++; limits.set(key, entry);
      // Bound development-only rate-limit housekeeping without background timers.
      if (limits.size > 1000) for (const [id, value] of limits) if (value.expires <= clock()) limits.delete(id);
      return entry.count <= maximum;
    },
  };
}

const globalStore = globalThis as typeof globalThis & { unoMemoryStore?: RoomStore };
let supabaseStore: RoomStore | undefined;
export function getStore(): RoomStore {
  if (process.env.VERCEL && process.env.UNO_STORE === "memory") throw new ServiceError("Memory rooms are disabled on Vercel. Configure Supabase.", 503);
  if (process.env.UNO_STORE === "memory" && !process.env.VERCEL) {
    return globalStore.unoMemoryStore ??= createMemoryStore();
  }
  const url = process.env.SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new ServiceError("Multiplayer storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY; see the setup guide.", 503);
  if (!secret.startsWith("sb_secret_")) throw new ServiceError("Use a Supabase backend secret key (sb_secret_...), not a publishable key.", 503);
  return supabaseStore ??= createSupabaseStore(createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
