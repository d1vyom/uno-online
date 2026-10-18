import { createHash, randomBytes } from "node:crypto";
export function newSessionToken(): string { return randomBytes(32).toString("hex"); }
export function hashSessionToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function readSession(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("uno_session="))?.slice(12);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function sessionCookie(token: string): string {
  return "uno_session=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400" +
    (process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "");
}
