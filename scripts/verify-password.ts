import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "../lib/env";
import { savePassword } from "../lib/auth/password-service";
import { newPasswordSchema, signInSchema } from "../lib/auth/validation";
import { getRecoveryConfig, issueRecoveryGrant, RECOVERY_COOKIE, RECOVERY_SECONDS } from "../lib/auth/recovery-grant";

async function checkPages() {
  const { url, key } = getPublicEnv();
  const config = getRecoveryConfig();
  const base = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
  assert.ok(base.protocol === "https:" || (base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)));
  assert.ok(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/");
  const jar = new Map<string, string>();
  const auth = createServerClient(url, key, { cookies: {
    getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
    setAll: items => { for (const { name, value } of items) jar.set(name, value); },
  } }).auth;
  try {
    const credentials = signInSchema.parse({ email: process.env.TEST_USER_A_EMAIL, password: process.env.TEST_USER_A_PASSWORD });
    const login = await auth.signInWithPassword(credentials);
    assert.equal(login.error, null); assert.ok(login.data.user);
    const cookie = Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
    const read = (path: string, grant?: string) => fetch(new URL(path, base), { redirect: "manual", headers: { Cookie: cookie + (grant ? `; ${RECOVERY_COOKIE}=${grant}` : "") }, signal: AbortSignal.timeout(15_000) });
    const account = await read("/account");
    assert.equal(account.status, 200); assert.ok((await account.text()).includes("Current password"));
    console.log("PASS: Verified disposable session can access Account/current-password form");
    for (const grant of [undefined, "forged", issueRecoveryGrant("00000000-0000-4000-8000-000000000099", config.secret), issueRecoveryGrant(login.data.user.id, config.secret, Date.now() - RECOVERY_SECONDS * 1000)]) {
      const response = await read("/auth/new-password", grant);
      assert.equal(response.status, 307); assert.equal(response.headers.get("location"), "/forgot-password?error=invalid_link");
    }
    console.log("PASS: Real signed-in session without recovery proof, forged/wrong-user/expired grants cannot open reset form");
    const recovered = await read("/auth/new-password", issueRecoveryGrant(login.data.user.id, config.secret));
    assert.equal(recovered.status, 200);
    const html = await recovered.text();
    assert.ok(html.includes("Confirm new password")); assert.ok(!html.includes("Current password"));
    console.log("PASS: Real signed-in session with test-issued matching grant can open reset form (email/OTP delivery not tested)");
  } finally { await auth.signOut({ scope: "local" }); }
}

async function main() {
  if (process.argv.slice(2).join(" ") === "--check-pages") {
    loadEnvConfig(process.cwd()); await checkPages(); return;
  }
  if (process.argv.slice(2).join(" ") !== "--change-disposable-password") {
    console.error("Use --check-pages for authenticated read-only page checks, or --change-disposable-password to temporarily change and restore TEST_USER_A's password. No reset emails are requested.");
    process.exitCode = 2; return;
  }
  loadEnvConfig(process.cwd());
  const credentials = signInSchema.parse({ email: process.env.TEST_USER_A_EMAIL, password: process.env.TEST_USER_A_PASSWORD });
  // Ensure the original can be restored under the application's new policy.
  if (!newPasswordSchema.safeParse({ password: credentials.password, confirmation: credentials.password }).success) {
    console.error("BLOCKED: TEST_USER_A's original password must meet the 12–128 character policy for this reversible check. Update the disposable user and local credential first. No password was changed.");
    process.exitCode = 2; return;
  }
  const { url, key } = getPublicEnv();
  const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const owner = client();
  assert.equal((await owner.auth.signInWithPassword(credentials)).error, null);
  const temporary = `Phase11-Aa1!${randomBytes(24).toString("hex")}`;
  const form = (current: string) => {
    const data = new FormData(); data.set("currentPassword", current); data.set("password", temporary); data.set("confirmation", temporary); return data;
  };
  let cleared = false;
  const clearGrant = async () => { cleared = true; };
  // Persist a private recovery record before mutation, even if the response is
  // lost or restoration fails. Never print either password or the email.
  const directory = "test-results/password-verification";
  const backup = `${directory}/credentials-${Date.now()}.json`;
  await mkdir(directory, { recursive: true });
  await writeFile(backup, JSON.stringify({ ...credentials, temporary }), { mode: 0o600 });
  let changed = false;
  try {
    assert.ok((await savePassword(owner.auth, form(`Incorrect-Aa1!${randomBytes(24).toString("hex")}`), { clearGrant })).error);
    assert.equal(cleared, false);
    console.log("PASS: Hosted Auth rejects an incorrect current password");
    const state = await savePassword(owner.auth, form(credentials.password), { clearGrant });
    assert.ok(state.success && cleared);
    changed = true;
    const updated = client();
    try { assert.equal((await updated.auth.signInWithPassword({ email: credentials.email, password: temporary })).error, null); }
    finally { await updated.auth.signOut({ scope: "local" }); }
    console.log("PASS: Password service changes the disposable password; new-password sign-in succeeds");
  } finally {
    const restoring = client();
    try {
      const login = await restoring.auth.signInWithPassword({ email: credentials.email, password: temporary });
      if (!login.error) assert.equal((await restoring.auth.updateUser({ password: credentials.password, current_password: temporary })).error, null);
      else assert.equal(changed, false);
      await restoring.auth.signOut({ scope: "local" });
      const confirmed = client();
      try { assert.equal((await confirmed.auth.signInWithPassword(credentials)).error, null); }
      finally { await confirmed.auth.signOut({ scope: "local" }); }
      await unlink(backup);
      console.log("PASS: Original disposable password restored and sign-in verified; private backup removed");
    } catch {
      console.error("RESTORATION UNCONFIRMED: Keep the private credential recovery record in test-results/password-verification and restore TEST_USER_A before rerunning checks.");
      throw new Error("Restoration unconfirmed");
    } finally { await owner.auth.signOut({ scope: "local" }); }
  }
}

main().catch(() => {
  console.error("Password verification failed or could not start. Check disposable credentials, password policy and Auth availability. No credential values or provider diagnostics are logged.");
  process.exitCode = 1;
});
