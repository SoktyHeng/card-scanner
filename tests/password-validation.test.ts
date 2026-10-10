import assert from "node:assert/strict";
import { test } from "node:test";
import { newPasswordSchema, recoveryTokenSchema, safeRedirectPath } from "../lib/auth/validation";

test("new passwords preserve whitespace and require bounds, content and matching confirmation", () => {
  const password = " a unique long password ";
  assert.equal(newPasswordSchema.parse({ password, confirmation: password }).password, password);
  for (const value of ["", "short", " ".repeat(20), "a".repeat(129)]) assert.equal(newPasswordSchema.safeParse({ password: value, confirmation: value }).success, false);
  assert.equal(newPasswordSchema.safeParse({ password, confirmation: "different password" }).success, false);
});
test("recovery tokens are bounded scalars; account return routes are allowed without accepting recovery/external destinations", () => {
  for (const token of [undefined, ["a".repeat(64)], "a".repeat(257), "invalid<script>"]) assert.equal(recoveryTokenSchema.safeParse(token).success, false);
  assert.ok(recoveryTokenSchema.safeParse("a".repeat(64)).success);
  assert.equal(safeRedirectPath("/account"), "/account");
  for (const path of ["/auth/new-password", "/accounting", "//outside.invalid", "/account/%2e%2e/login"]) assert.equal(safeRedirectPath(path), "/dashboard");
});
