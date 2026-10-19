import type { APIRequestContext } from "@playwright/test";
export function readApi(request: APIRequestContext, url: string) {
  return request.get(url, { timeout: 12_000, maxRetries: 3 });
}
