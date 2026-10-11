import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedPageUser } from "../../lib/auth/page-user";

test("page identity verifies signed claims and rejects forged, expired and inappropriate identities", async () => {
  const project = "https://page-auth-test.supabase.co";
  const id = "00000000-0000-4000-8000-000000000001";
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "test-key", alg: "ES256", use: "sig" };
  const supabase = createClient(project, "public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      assert.ok(String(input).endsWith("/.well-known/jwks.json"));
      return Response.json({ keys: [publicKey] });
    } },
  });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "ES256", kid: "test-key", typ: "JWT" });
  const claims = { sub: id, email: "test@example.com", iss: `${project}/auth/v1`, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000) };
  async function sign(payload: unknown) {
    const body = `${header}.${encode(payload)}`;
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(body));
    return `${body}.${Buffer.from(signature).toString("base64url")}`;
  }
  const userFor = (token: string) => getVerifiedPageUser({ getClaims: () => supabase.auth.getClaims(token) }, project);
  const token = await sign(claims);
  assert.deepEqual(await userFor(token), { id, email: claims.email });
  assert.equal(await userFor(`${header}.${encode({ ...claims, sub: "00000000-0000-4000-8000-000000000002" })}.${token.split(".")[2]}`), null);
  for (const changes of [{ exp: 1 }, { iss: "https://other.supabase.co/auth/v1" }, { role: "anon" }, { aud: "other" }, { sub: "invalid" }]) {
    assert.equal(await userFor(await sign({ ...claims, ...changes })), null);
  }
  assert.equal(await getVerifiedPageUser(supabase.auth, project), null);
});
