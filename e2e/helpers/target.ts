export function e2eTarget(env: Record<string, string | undefined> = process.env) {
  const remote = env.BASE_URL !== undefined;
  const target = new URL(env.BASE_URL ?? "http://localhost:3100");
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash) throw new Error("BASE_URL must be a plain HTTP(S) origin without credentials, path, query or fragment.");
  const store = env.UNO_E2E_STORE ?? (remote ? "supabase" : "memory");
  if (store !== "memory" && store !== "supabase") throw new Error("UNO_E2E_STORE must be memory or supabase.");
  if (remote && store !== "supabase") throw new Error("Deployed verification requires Supabase storage.");
  return { baseURL: target.origin, store, remote };
}
