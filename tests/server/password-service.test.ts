import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getRecoveryConfig, issueRecoveryGrant, validRecoveryGrant, RECOVERY_SECONDS } from "../../lib/auth/recovery-grant";
import { INVALID_RECOVERY, RESET_MESSAGE, requestPasswordReset, savePassword, verifyPasswordRecovery, type PasswordAuth } from "../../lib/auth/password-service";
import { createClient } from "@supabase/supabase-js";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const secret = "test-only-recovery-secret-32-characters";
const token = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const password = " new unique password ";
function form(current = "current password") {
  const data = new FormData();
  data.set("password", password); data.set("confirmation", password); data.set("currentPassword", current);
  return data;
}
function fixture() {
  const calls: Array<{ operation: string; value?: unknown }> = [];
  const auth: PasswordAuth = {
    resetPasswordForEmail: async (email, options) => { calls.push({ operation: "reset", value: { email, options } }); return { error: null }; },
    verifyOtp: async options => { calls.push({ operation: "verify", value: options }); return { error: null }; },
    getUser: async () => { calls.push({ operation: "user" }); return { data: { user: { id: userId, email: "verified@example.com" } }, error: null }; },
    signInWithPassword: async options => { calls.push({ operation: "reauthenticate", value: options }); return { data: { user: { id: userId } }, error: null }; },
    updateUser: async options => { calls.push({ operation: "update", value: options }); return { error: null }; },
    signOut: async options => { calls.push({ operation: "signOut", value: options }); return { error: null }; },
  };
  const clearGrant = async () => { calls.push({ operation: "clear" }); };
  return { auth, calls, clearGrant };
}

test("reset email validates input, uses fixed callback and never reveals account existence or upstream errors", async () => {
  const { auth, calls } = fixture();
  assert.ok((await requestPasswordReset(auth, "invalid", "https://app.example")).error);
  assert.equal(calls.length, 0);
  assert.deepEqual(await requestPasswordReset(auth, " user@example.com ", "https://app.example"), { success: true, message: RESET_MESSAGE });
  assert.deepEqual(calls[0].value, { email: "user@example.com", options: { redirectTo: "https://app.example/auth/recovery" } });
  for (const variant of [async () => ({ error: { message: "PRIVATE SMTP/account diagnostic" } }), async () => { throw new Error("PRIVATE SECRET"); }]) {
    auth.resetPasswordForEmail = variant;
    assert.deepEqual(await requestPasswordReset(auth, "missing@example.com", "https://app.example"), { success: true, message: RESET_MESSAGE });
  }
});

test("recovery verification uses only recovery OTP and a verified user before issuing a signed grant", async () => {
  const { auth, calls } = fixture();
  assert.equal(await verifyPasswordRecovery(auth, "invalid", secret), null);
  assert.equal(calls.length, 0);
  const grant = await verifyPasswordRecovery(auth, token, secret);
  assert.ok(validRecoveryGrant(grant ?? undefined, userId, secret));
  assert.deepEqual(calls[0].value, { token_hash: token, type: "recovery" });
  assert.deepEqual(calls.map(call => call.operation), ["verify", "user"]);
  auth.verifyOtp = async () => ({ error: { message: "expired token" } });
  assert.equal(await verifyPasswordRecovery(auth, token, secret), null);
  auth.verifyOtp = async () => { throw new Error("upstream secret"); };
  assert.equal(await verifyPasswordRecovery(auth, token, secret), null);
});

test("recovery grants reject expiry, wrong user, tampering, malformed signatures and future-dated grants", () => {
  const now = 1_000_000;
  const grant = issueRecoveryGrant(userId, secret, now);
  assert.ok(validRecoveryGrant(grant, userId, secret, now));
  assert.equal(validRecoveryGrant(grant, otherId, secret, now), false);
  assert.equal(validRecoveryGrant(grant, userId, "wrong-secret", now), false);
  assert.equal(validRecoveryGrant(grant, userId, secret, now + RECOVERY_SECONDS * 1000), false);
  assert.equal(validRecoveryGrant(grant, userId, secret, now - 1000), false);
  for (const bad of [undefined, "", "broken", `${grant}.extra`, grant + "x", "x." + "é".repeat(43), "x." + "a".repeat(43), "x".repeat(1001)])
    assert.equal(validRecoveryGrant(bad, userId, secret, now), false);
});

test("password change validates confirmation/current password and sends preserved current_password to authenticated update", async () => {
  const { auth, calls, clearGrant } = fixture();
  const mismatch = form(); mismatch.set("confirmation", "different password");
  assert.ok((await savePassword(auth, mismatch, { clearGrant })).error);
  const short = form(); short.set("password", "short"); short.set("confirmation", "short");
  assert.ok((await savePassword(auth, short, { clearGrant })).error);
  const unchanged = form(password);
  assert.ok((await savePassword(auth, unchanged, { clearGrant })).error);
  assert.ok((await savePassword(auth, form(""), { clearGrant })).error);
  assert.equal(calls.length, 0);
  const result = await savePassword(auth, form(" old password "), { clearGrant });
  assert.equal(result.success, true);
  assert.equal(result.signedOut, true);
  assert.deepEqual(calls.map(call => call.operation), ["user", "reauthenticate", "update", "clear", "signOut"]);
  assert.deepEqual(calls[1].value, { email: "verified@example.com", password: " old password " });
  assert.deepEqual(calls[2].value, { password, current_password: " old password " });
  assert.deepEqual(calls[4].value, { scope: "global" });
});

test("current-password verification prevents updates even when hosted update would accept an incorrect password", async () => {
  for (const returnedId of [null, otherId]) {
    const { auth, calls, clearGrant } = fixture();
    auth.signInWithPassword = async () => ({ data: { user: returnedId ? { id: returnedId } : null }, error: returnedId ? null : { message: "invalid credentials" } });
    assert.ok((await savePassword(auth, form("incorrect password"), { clearGrant })).error);
    assert.equal(calls.some(call => ["update", "clear", "signOut"].includes(call.operation)), false);
  }
  const { auth, calls, clearGrant } = fixture();
  auth.getUser = async () => ({ data: { user: { id: userId } }, error: null });
  assert.ok((await savePassword(auth, form(), { clearGrant })).error);
  assert.equal(calls.length, 0);
});

test("reset password requires both verified session and user-bound grant and never accepts a normal session alone", async () => {
  const { auth, calls, clearGrant } = fixture();
  for (const grant of [undefined, "forged", issueRecoveryGrant(otherId, secret), issueRecoveryGrant(userId, secret, Date.now() - RECOVERY_SECONDS * 1000)]) {
    assert.deepEqual(await savePassword(auth, form(), { clearGrant, recovery: { grant, secret } }), { error: INVALID_RECOVERY });
    assert.equal(calls.some(call => call.operation === "update"), false);
  }
  calls.length = 0;
  assert.equal((await savePassword(auth, form(), { clearGrant, recovery: { grant: issueRecoveryGrant(userId, secret), secret } })).success, true);
  assert.deepEqual(calls[1].value, { password });
  auth.getUser = async () => ({ data: { user: null }, error: { message: "expired session" } });
  assert.ok((await savePassword(auth, form(), { clearGrant })).error);
});

test("failed password updates retain grants for retry; completed updates stay successful if sign-out/cleanup fails", async () => {
  const { auth, calls, clearGrant } = fixture();
  auth.updateUser = async () => ({ error: { message: "PRIVATE password error" } });
  const failed = await savePassword(auth, form(), { clearGrant });
  assert.ok(failed.error);
  assert.equal(JSON.stringify(failed).includes("PRIVATE"), false);
  assert.equal(calls.some(call => call.operation === "clear" || call.operation === "signOut"), false);
  auth.updateUser = async () => ({ error: null });
  auth.signOut = async () => ({ error: { message: "PRIVATE sign-out error" } });
  const succeeded = await savePassword(auth, form(), { clearGrant });
  assert.ok(succeeded.success);
  assert.equal(succeeded.signedOut, false);
  assert.match(succeeded.message!, /could not sign out/);
  let signedOut = false;
  auth.signOut = async () => { signedOut = true; return { error: null }; };
  assert.ok((await savePassword(auth, form(), { clearGrant: async () => { throw new Error(); } })).success);
  assert.ok(signedOut);
});

const priorSite = process.env.APP_SITE_URL, priorSecret = process.env.AUTH_RECOVERY_SECRET;
afterEach(() => {
  if (priorSite === undefined) delete process.env.APP_SITE_URL; else process.env.APP_SITE_URL = priorSite;
  if (priorSecret === undefined) delete process.env.AUTH_RECOVERY_SECRET; else process.env.AUTH_RECOVERY_SECRET = priorSecret;
});
test("recovery configuration rejects external redirect paths, credentials, nonlocal HTTP and missing secrets", () => {
  process.env.AUTH_RECOVERY_SECRET = secret;
  for (const url of ["http://app.example", "https://user:pass@app.example", "https://app.example/path", "https://app.example/?next=evil", "https://app.example/#secret"]) {
    process.env.APP_SITE_URL = url;
    assert.throws(getRecoveryConfig);
  }
  process.env.APP_SITE_URL = "https://app.example/";
  assert.equal(getRecoveryConfig().siteUrl, "https://app.example");
  process.env.APP_SITE_URL = "http://localhost:3000";
  assert.equal(getRecoveryConfig().siteUrl, "http://localhost:3000");
  delete process.env.AUTH_RECOVERY_SECRET;
  assert.throws(getRecoveryConfig);
});

test("actual Supabase SDK transmits current_password, recovery type, redirect and global logout", async () => {
  const requests: Array<{ path: string; body: unknown; scope: string | null; redirect: string | null }> = [];
  const client = createClient("https://test.supabase.co", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ path, body, scope: url.searchParams.get("scope"), redirect: url.searchParams.get("redirect_to") });
      if (path.endsWith("/token") || path.endsWith("/verify")) return Response.json({ access_token: "test-token", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user: { id: userId, email: "test@example.com" } });
      if (path.endsWith("/user")) return Response.json({ id: userId, email: "test@example.com" });
      return Response.json({});
    } },
  });
  await client.auth.signInWithPassword({ email: "test@example.com", password: "initial-password" });
  await requestPasswordReset(client.auth, "test@example.com", "https://app.example");
  assert.ok(await verifyPasswordRecovery(client.auth, token, secret));
  const result = await savePassword(client.auth, form(), { clearGrant: async () => {} });
  assert.ok(result.success);
  assert.ok(requests.some(item => item.path.endsWith("/user") && JSON.stringify(item.body).includes('"current_password":"current password"')));
  assert.ok(requests.some(item => item.path.endsWith("/verify") && JSON.stringify(item.body).includes('"type":"recovery"')));
  assert.ok(requests.some(item => item.path.endsWith("/recover") && item.redirect === "https://app.example/auth/recovery"));
  assert.ok(requests.some(item => item.path.endsWith("/logout") && item.scope === "global"));
});
