import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { cleanupDraft } from "../lib/drafts/service";

// Run hourly in a trusted server environment. Never expose this key to a browser.
loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure server-only SUPABASE_SERVICE_ROLE_KEY for scheduled draft cleanup.");
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30000)]) }) } });
  const result = await supabase.from("scan_drafts").select("*").or(`expires_at.lte.${new Date().toISOString()},state.in.(consumed,discarded)`).order("expires_at").limit(100);
  if (result.error) throw new Error("Unable to list expired drafts.");
  let failed = 0;
  for (const row of result.data ?? []) {
    try { await cleanupDraft({ supabase, userId: row.user_id }, row); } catch { failed++; }
  }
  console.info(`Draft cleanup examined ${result.data?.length ?? 0} rows; ${failed} deferred.`);
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("Draft cleanup unavailable; check server configuration and retry."); process.exitCode = 1; });
