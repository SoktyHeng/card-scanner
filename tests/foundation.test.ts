import assert from "node:assert/strict";
import { test } from "node:test";
import { publicEnvSchema } from "../lib/env";
import { safeRedirectPath, signInSchema } from "../lib/auth/validation";

test("public configuration permits publishable/anon keys and rejects privileged keys", () => {
  const url = "https://example.supabase.co";
  const jwt = (role: string) =>
    `header.${btoa(JSON.stringify({ role }))}.signature`;
  assert.ok(
    publicEnvSchema.safeParse({ url, key: "sb_publishable_test" }).success,
  );
  assert.ok(publicEnvSchema.safeParse({ url, key: jwt("anon") }).success);
  for (const key of ["", "sb_secret_test", jwt("service_role"), "not-a-key"]) {
    assert.equal(publicEnvSchema.safeParse({ url, key }).success, false);
  }
  assert.equal(
    publicEnvSchema.safeParse({
      url: "http://example.com",
      key: "sb_publishable_test",
    }).success,
    false,
  );
  assert.ok(
    publicEnvSchema.safeParse({
      url: "http://127.0.0.1:54321",
      key: jwt("anon"),
    }).success,
  );
});

test("credentials are validated without changing passwords", () => {
  const valid = signInSchema.parse({
    email: " user@example.com ",
    password: " password ",
  });
  assert.equal(valid.email, "user@example.com");
  assert.equal(valid.password, " password ");
  assert.equal(
    signInSchema.safeParse({ email: "invalid", password: "" }).success,
    false,
  );
});

test("return destinations stay within application routes", () => {
  assert.equal(safeRedirectPath("/dashboard"), "/dashboard");
  assert.equal(
    safeRedirectPath("/cards/123?tab=details"),
    "/cards/123?tab=details",
  );
  for (const path of [
    undefined,
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/login",
    "/dashboard-other",
    "/cards/../login",
    "/cards/%2e%2e/login",
  ]) {
    assert.equal(safeRedirectPath(path), "/dashboard");
  }
});
