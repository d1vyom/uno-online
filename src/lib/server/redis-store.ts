import type { Redis } from "@upstash/redis";
import type { Room, RoomStore } from "./types";
const TTL = 86400;
const CREATE = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
local old = redis.call("GET", KEYS[2])
if old and redis.call("EXISTS", ARGV[4] .. old) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2], "NX")
redis.call("SET", KEYS[2], ARGV[3], "EX", ARGV[2])
return 1`;
const COMMIT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local old = cjson.decode(raw)
if old.revision ~= tonumber(ARGV[1]) then return 0 end
local next = cjson.decode(ARGV[2])
local add = ARGV[5]
if add ~= "" then
  local active = redis.call("GET", ARGV[4] .. "member:" .. add)
  if active and active ~= next.code and redis.call("EXISTS", ARGV[4] .. "room:" .. active) == 1 then return 0 end
end
for _, player in ipairs(old.players) do
  local found = false
  for _, remaining in ipairs(next.players) do
    if remaining.sessionHash == player.sessionHash then found = true end
  end
  if not found then redis.call("DEL", ARGV[4] .. "member:" .. player.sessionHash) end
end
if #next.players == 0 then redis.call("DEL", KEYS[1])
else
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
  for _, player in ipairs(next.players) do
    redis.call("SET", ARGV[4] .. "member:" .. player.sessionHash, next.code, "EX", ARGV[3])
  end
end
return 1`;
const RATE = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return count`;
const ACTIVE = `
local code = redis.call("GET", KEYS[1])
if not code then return false end
local raw = redis.call("GET", ARGV[1] .. code)
if raw then
  local room = cjson.decode(raw)
  for _, player in ipairs(room.players) do if player.sessionHash == ARGV[2] then return code end end
end
redis.call("DEL", KEYS[1])
return false`;

export function createRedisStore(redis: Redis, namespace = "uno:v1:"): RoomStore {
  return {
    mode: "redis",
    async read(code) { return redis.get<Room>(namespace + "room:" + code); },
    async activeRoom(hash) { return await redis.eval<string | null>(ACTIVE, [namespace + "member:" + hash], [namespace + "room:", hash]) || null; },
    async create(room, hash) {
      return await redis.eval<number>(CREATE, [namespace + "room:" + room.code, namespace + "member:" + hash],
        [JSON.stringify(room), TTL, room.code, namespace + "room:"]) === 1;
    },
    async commit(previousRevision, room, membership = {}) {
      return await redis.eval<number>(COMMIT, [namespace + "room:" + room.code],
        [previousRevision, JSON.stringify(room), TTL, namespace, membership.add ?? ""]) === 1;
    },
    async consumeLimit(key, maximum, seconds) {
      return await redis.eval<number>(RATE, [namespace + "limit:" + key], [seconds]) <= maximum;
    },
  };
}
