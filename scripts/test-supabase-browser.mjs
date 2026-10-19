import { spawnSync } from "node:child_process";
process.loadEnvFile(".env.local");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("Configure the dedicated Supabase project in .env.local before live browser tests.");
}
const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, UNO_E2E_STORE: "supabase" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
