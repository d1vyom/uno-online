export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new ApiError(typeof data.error === "string" ? data.error : "Something went wrong. Please retry.", response.status);
  return data as T;
}
export function postJson<T>(url: string, data: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal });
}
