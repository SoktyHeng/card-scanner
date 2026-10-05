import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  for (const path of ["/", "/dashboard", "/cards", "/cards/example/edit", "/scan"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 307, `Unauthenticated route ${path}`);
    assert.ok(response.headers.get("location")?.startsWith("/login"));
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    console.log(`PASS: Unauthenticated navigation protected: ${path}`);
  }
  const login = await fetch(base + "/login");
  const html = await login.text();
  assert.equal(login.status, 200);
  for (const text of ["Email address", "Password", "Sign in", 'autoComplete="username"', 'autoComplete="current-password"']) assert.ok(html.includes(text));
  console.log("PASS: Login renders labelled credential fields");

  const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const key = `sb-${projectUrl.hostname.split(".")[0]}-auth-token`;
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const forgedToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "00000000-0000-4000-8000-000000000001", exp: expires, role: "authenticated" })}.invalid-signature`;
  const cookie = `base64-${encode({ access_token: forgedToken, refresh_token: "invalid", token_type: "bearer", expires_in: 3600, expires_at: expires, user: { id: "00000000-0000-4000-8000-000000000001" } })}`;
  const forged = await fetch(base + "/dashboard", { redirect: "manual", headers: { Cookie: `${key}=${cookie}` } });
  assert.equal(forged.status, 307);
  assert.ok(forged.headers.get("location")?.startsWith("/login"));
  console.log("PASS: Forged session cookie cannot access dashboard");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Application verification failed");
  process.exitCode = 1;
});
