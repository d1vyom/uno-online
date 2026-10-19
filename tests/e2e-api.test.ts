import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import { request, type APIRequestContext } from "@playwright/test";
import { readApi } from "../e2e/helpers/api";
let server: Server | undefined, context: APIRequestContext | undefined;
afterEach(async () => { await context?.dispose(); if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); });
async function endpoint(handler: RequestListener) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test listener");
  context = await request.newContext(); return "http://127.0.0.1:" + address.port;
}
describe("deployed verification reads", () => {
  it("recovers one reset connection before reading the real response", async () => {
    let calls = 0;
    const url = await endpoint((req, res) => {
      if (++calls === 1) { req.socket.destroy(); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ revision: 12 }));
    });
    const response = await readApi(context!, url);
    expect(await response.json()).toEqual({ revision: 12 }); expect(calls).toBe(2);
  });
  it("exposes HTTP service failures immediately without retrying them", async () => {
    let calls = 0;
    const url = await endpoint((_req, res) => { calls++; res.writeHead(503); res.end("Unavailable"); });
    expect((await readApi(context!, url)).status()).toBe(503); expect(calls).toBe(1);
  });
});
