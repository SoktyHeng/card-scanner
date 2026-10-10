import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { ForgotPasswordForm, PasswordForm, RecoveryConfirmationForm } from "../components/auth/password-forms";

Object.defineProperty(globalThis, "FormData", { configurable: true, value: window.FormData });
afterEach(cleanup);

test("forgot-password form has labeled email, pending state, neutral feedback and prevents duplicate submission", async () => {
  let calls = 0, finish!: () => void;
  const view = render(createElement(ForgotPasswordForm, { action: async (_, form) => {
    calls++; assert.equal(form.get("email"), "test@example.com");
    await new Promise<void>(resolve => { finish = resolve; });
    return { success: true, message: "If an account exists, check your email." };
  } }));
  fireEvent.change(view.getByLabelText("Email address"), { target: { value: "test@example.com" } });
  fireEvent.click(view.getByRole("button", { name: "Send reset link" }));
  await waitFor(() => assert.equal(calls, 1));
  assert.ok((view.getByRole("button", { name: "Requesting link…" }) as HTMLButtonElement).disabled);
  fireEvent.click(view.getByRole("button", { name: "Requesting link…" }));
  assert.equal(calls, 1);
  finish();
  await waitFor(() => assert.match(view.getByRole("status").textContent!, /If an account exists/));
  assert.equal(view.getByRole("link", { name: "Back to sign in" }).getAttribute("href"), "/login");
});

test("password change requires current password, retains inputs on error and removes secrets after success", async () => {
  let calls = 0;
  const view = render(createElement(PasswordForm, { action: async (_, form) => {
    calls++; assert.equal(form.get("currentPassword"), "old-password");
    return calls === 1 ? { error: "Unable to update your password." } : { success: true, message: "Password updated. Sign in again." };
  } }));
  for (const [label, value] of [["Current password", "old-password"], ["New password", "new long password"], ["Confirm new password", "new long password"]]) {
    fireEvent.change(view.getByLabelText(label), { target: { value } });
  }
  assert.equal(view.getByLabelText("Current password").getAttribute("autocomplete"), "current-password");
  assert.equal(view.getByLabelText("New password").getAttribute("autocomplete"), "new-password");
  fireEvent.click(view.getByRole("button", { name: "Update password" }));
  await waitFor(() => assert.match(view.getByRole("alert").textContent!, /Unable to update/));
  assert.equal((view.getByLabelText("New password") as HTMLInputElement).value, "new long password");
  fireEvent.click(view.getByRole("button", { name: "Update password" }));
  await waitFor(() => assert.match(view.getByRole("status").textContent!, /Password updated/));
  assert.equal(view.container.querySelectorAll('input[type="password"]').length, 0);
  assert.equal(view.getByRole("link", { name: "Sign in with your new password" }).getAttribute("href"), "/login");
});

test("recovery screen requires explicit confirmation, reports expired links and offers a fresh request", async () => {
  let calls = 0;
  const view = render(createElement(RecoveryConfirmationForm, { tokenHash: "a".repeat(64), action: async (_, form) => {
    calls++; assert.equal(form.get("tokenHash"), "a".repeat(64)); return { error: "This password reset link is invalid or has expired." };
  } }));
  assert.equal(calls, 0);
  fireEvent.click(view.getByRole("button", { name: "Continue to reset password" }));
  await waitFor(() => assert.match(view.getByRole("alert").textContent!, /expired/));
  assert.ok((view.getByRole("button", { name: "Continue to reset password" }) as HTMLButtonElement).disabled);
  assert.equal(view.getByRole("link", { name: "Request a new reset link" }).getAttribute("href"), "/forgot-password");
  view.unmount();
  const reset = render(createElement(PasswordForm, { recovery: true, action: async () => ({}) }));
  assert.equal(reset.queryByLabelText("Current password"), null);
  assert.ok(reset.getByLabelText("New password"));
});
