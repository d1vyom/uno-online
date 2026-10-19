import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules(); vi.stubEnv("UNO_STORE", "supabase"); vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_contract-test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("production storage selection", () => {
  it("reports durable Supabase health after a real SDK read", async () => {
    vi.stubGlobal("fetch", async () => new Response("null", { headers: { "content-type": "application/json" } }));
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", storage: "supabase", durable: true });
  });
  it("returns actionable 503 when configuration is missing", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    const { GET } = await import("@/app/api/health/route"); const response = await GET();
    expect(response.status).toBe(503); expect((await response.json()).error).toMatch(/Supabase|SUPABASE/);
  });
  it("never enables memory storage on Vercel", async () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("UNO_STORE", "memory");
    const { getStore } = await import("@/lib/server/store");
    expect(() => getStore()).toThrow(/memory|Supabase/i);
  });
  it("does not fall back to memory on a database error", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Unavailable", code: "PGRST000" }), { status: 503, headers: { "content-type": "application/json" } }));
    const { GET } = await import("@/app/api/health/route");
    expect((await GET()).status).toBe(503);
  });
  it("keeps explicit local memory mode clearly non-durable", async () => {
    vi.stubEnv("UNO_STORE", "memory");
    const { GET } = await import("@/app/api/health/route"); const response = await GET();
    expect(await response.json()).toEqual({ status: "ok", storage: "memory", durable: false });
  });
});
