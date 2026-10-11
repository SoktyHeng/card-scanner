import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  loadEnvConfig(process.cwd());
  const secrets = [process.env.AI_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.AUTH_RECOVERY_SECRET]
    .filter((value): value is string => !!value && value.length >= 12);
  async function checkBrowserFiles(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await checkBrowserFiles(path);
      else if (entry.name.endsWith(".js")) {
        const code = await readFile(path, "utf8");
        assert.ok(!secrets.some(secret => code.includes(secret)), "A configured server secret was found in a browser bundle");
      }
    }
  }
  if (secrets.length) {
    await checkBrowserFiles(join(process.cwd(), ".next", "static"));
    console.log("PASS: Configured server keys absent from generated browser JavaScript");
  } else console.log("BLOCKED: No configured server keys available for the browser-bundle leak check");
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  for (const path of [
    "/",
    "/dashboard",
    "/cards",
    "/cards/00000000-0000-4000-8000-000000000003",
    "/cards/00000000-0000-4000-8000-000000000003/edit",
    "/scan",
    "/account",
  ]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 307, `Unauthenticated route ${path}`);
    assert.ok(response.headers.get("location")?.startsWith("/login"));
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    console.log(`PASS: Unauthenticated navigation protected: ${path}`);
  }
  const login = await fetch(base + "/login");
  const html = await login.text();
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("x-content-type-options"), "nosniff");
  assert.equal(login.headers.get("referrer-policy"), "no-referrer");
  assert.equal(login.headers.get("x-frame-options"), "DENY");
  assert.match(login.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  for (const text of [
    "Email address",
    "Password",
    "Sign in",
    'autoComplete="username"',
    'autoComplete="current-password"',
  ])
    assert.ok(html.includes(text));
  console.log("PASS: Login renders labelled credential fields");
  assert.ok(html.includes("Forgot password?"));
  for (const language of ["en", "km", "invalid"]) {
    const localized = await fetch(base + "/login", { headers: { Cookie: `card-scanner-language=${language}` } });
    assert.equal(localized.status, 200);
    const page = await localized.text();
    const expected = language === "km" ? "km" : "en";
    assert.ok(page.includes(`<html lang="${expected}"`));
    assert.ok(page.includes(expected === "km" ? "សូមស្វាគមន៍មកវិញ" : "Welcome back"));
    assert.ok(page.includes('id="interface-language"'));
    console.log(`PASS: Server-rendered interface language ${language} -> ${expected}`);
  }
  const forgot = await fetch(base + "/forgot-password");
  assert.equal(forgot.status, 200);
  assert.match(forgot.headers.get("cache-control") ?? "", /no-store/);
  const forgotHtml = await forgot.text();
  for (const label of ["Email address", "Send reset link", "Back to sign in"]) assert.ok(forgotHtml.includes(label));
  const reset = await fetch(base + "/auth/new-password", { redirect: "manual" });
  assert.equal(reset.status, 307);
  assert.equal(reset.headers.get("location"), "/forgot-password?error=invalid_link");
  const invalidLink = await fetch(base + "/auth/recovery?type=signup&token_hash=invalid&next=https://outside.invalid", { redirect: "manual" });
  assert.equal(invalidLink.status, 200);
  assert.ok((await invalidLink.text()).includes("This password reset link is invalid or has expired."));
  for (const query of ["type=recovery&token_hash=a&token_hash=b", "type=recovery&type=signup&token_hash=" + "a".repeat(64)]) {
    const repeated = await fetch(base + "/auth/recovery?" + query);
    assert.equal(repeated.status, 200);
    assert.ok((await repeated.text()).includes("This password reset link is invalid or has expired."));
  }
  const updated = await fetch(base + "/auth/password-updated");
  assert.equal(updated.status, 200);
  assert.ok((await updated.text()).includes("Sign in with your new password"));
  console.log("PASS: Recovery request renders; anonymous new-password and invalid recovery links fail closed");

  const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const key = `sb-${projectUrl.hostname.split(".")[0]}-auth-token`;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const forgedToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "00000000-0000-4000-8000-000000000001", exp: expires, role: "authenticated" })}.invalid-signature`;
  const cookie = `base64-${encode({ access_token: forgedToken, refresh_token: "invalid", token_type: "bearer", expires_in: 3600, expires_at: expires, user: { id: "00000000-0000-4000-8000-000000000001" } })}`;
  const forged = await fetch(base + "/dashboard", {
    redirect: "manual",
    headers: { Cookie: `${key}=${cookie}` },
  });
  assert.equal(forged.status, 307);
  assert.ok(forged.headers.get("location")?.startsWith("/login"));
  console.log("PASS: Forged session cookie cannot access dashboard");
  for (const headers of [new Headers(), new Headers({ Cookie: `${key}=${cookie}` })]) {
    const response = await fetch(base + "/api/cards/extract", {
      method: "POST",
      headers,
      redirect: "manual",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Your session has expired. Sign in again before extracting.",
      },
    });
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  }
  console.log(
    "PASS: Extraction API rejects anonymous and forged sessions with safe JSON",
  );
  for (const headers of [new Headers(), new Headers({ Cookie: `${key}=${cookie}` })]) {
    const response = await fetch(base + "/api/cards", { method: "POST", headers, redirect: "manual" });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "UNAUTHORIZED");
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  }
  console.log("PASS: Save API rejects anonymous and forged sessions before processing uploads");
  for (const method of ["PATCH", "DELETE"]) {
    for (const headers of [new Headers(), new Headers({ Cookie: `${key}=${cookie}` })]) {
      const response = await fetch(base + "/api/cards/00000000-0000-4000-8000-000000000003", { method, headers });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "UNAUTHORIZED");
      assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    }
  }
  console.log("PASS: Edit/archive/restore/delete API rejects anonymous and forged sessions");
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Application verification failed",
  );
  process.exitCode = 1;
});
