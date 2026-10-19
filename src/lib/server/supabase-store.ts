import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStoredRoom } from "./stored-room";
import { ServiceError, type RoomStore } from "./types";
export function createSupabaseStore(client: SupabaseClient): RoomStore {
  async function call<T>(name: string, args: Record<string, unknown>, parse: (data: unknown) => T): Promise<T> {
    try {
      const { data, error, status } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(8_000));
      // Scalar RPCs return HTTP 200, including an explicit JSON null. The SDK
      // normalizes some empty upstream 404s to 204 without an error object.
      if (error || status !== 200) throw error ?? new Error("Unexpected RPC status.");
      return parse(data);
    } catch {
      throw new ServiceError("Multiplayer storage is unavailable. Check the Supabase connection and schema setup.", 503);
    }
  }
  function boolean(data: unknown): boolean {
    if (typeof data !== "boolean") throw new Error("Invalid RPC result.");
    return data;
  }
  return {
    mode: "supabase",
    read(code) { return call("uno_room_read", { p_code: code }, (data) => data === null ? null : parseStoredRoom(data, code)); },
    activeRoom(hash) {
      return call("uno_active_room", { p_session_hash: hash }, (data) => {
        if (data === null) return null;
        if (typeof data !== "string" || !/^[A-Z2-9]{6}$/.test(data)) throw new Error("Invalid membership.");
        return data;
      });
    },
    create(room, hash) { return call("uno_room_create", { p_room: room, p_session_hash: hash }, boolean); },
    commit(previous, room, membership = {}) {
      return call("uno_room_commit", { p_expected_revision: previous, p_room: room, p_added_session_hash: membership.add ?? null }, boolean);
    },
    consumeLimit(key, maximum, seconds) {
      return call("uno_take_rate_limit", { p_key: key, p_maximum: maximum, p_window_seconds: seconds }, boolean);
    },
  };
}
