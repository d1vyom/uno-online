import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function config(base?: string, store?: string) {
  vi.resetModules(); vi.stubEnv("BASE_URL", base); vi.stubEnv("UNO_E2E_STORE", store);
  return (await import("../playwright.config")).default;
}
describe("browser verification target", () => {
  it("keeps the isolated memory server for ordinary local verification", async () => {
    const value = await config();
    expect(value.use?.baseURL).toBe("http://localhost:3100");
    expect(value.webServer).toMatchObject({ env: { UNO_STORE: "memory" } });
  });
  it("targets the deployed origin without starting a local server", async () => {
    const value = await config("https://uno.example.com");
    expect(value.use?.baseURL).toBe("https://uno.example.com");
    expect(value.webServer).toBeUndefined();
  });
  it("rejects memory verification against a deployed origin", async () => {
    await expect(config("https://uno.example.com", "memory")).rejects.toThrow(/Supabase/i);
  });
  it.each(["", "ftp://uno.example.com", "https://guest:password@uno.example.com", "https://uno.example.com/room/ABC234", "https://uno.example.com?key=x", "https://uno.example.com#fragment"])("rejects unsafe or ambiguous origin %s", async (origin) => {
    await expect(config(origin)).rejects.toThrow();
  });
});
