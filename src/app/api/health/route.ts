import { getStore } from "@/lib/server/store";
import { boundary, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return boundary(async () => {
    const store = getStore(); await store.read("health-check");
    return json({ status: "ok", storage: store.mode, durable: store.mode === "supabase" });
  });
}
