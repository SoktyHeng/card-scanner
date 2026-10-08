import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CardActionControls } from "../components/cards/card-actions";
import { CardEditControls } from "../components/cards/card-edit-form";
import { cardOperation } from "../components/cards/card-operation";
import { businessCard } from "./fixtures/extraction";
import { createReviewDraft, validateReviewDraft } from "../lib/cards/review";

const originalFetch = globalThis.fetch;
// jsdom lacks the native modal API; opening/closing models its visibility.
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test("edit saving prevents duplicate submissions, keeps corrected draft after failure, and retries successfully", async () => {
  const extraction = businessCard();
  const reviewed = validateReviewDraft(createReviewDraft(extraction));
  assert.ok(reviewed.success);
  const original = structuredClone(extraction);
  let calls = 0;
  let saved = false;
  let finish: ((value: Response) => void) | undefined;
  globalThis.fetch = async (_input, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.reviewedData.name, "My corrected name");
    assert.equal(payload.expectedUpdatedAt, "2026-10-07T00:00:00Z");
    if (calls === 1) return new Promise(resolve => { finish = resolve; });
    return Response.json({ success: true });
  };
  const view = render(createElement(CardEditControls, { id: "card-id", updatedAt: "2026-10-07T00:00:00Z", initialData: reviewed.data,
    extraction, rawText: extraction.rawText, onSaved: () => { saved = true; } }));
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "My corrected name" } });
  const button = view.getByRole("button", { name: "Save changes" });
  fireEvent.click(button); fireEvent.click(button);
  assert.equal(calls, 1);
  assert.ok(view.getByRole("status").textContent?.includes("Saving"));
  finish!(Response.json({ success: false, error: { code: "OPERATION_FAILED", message: "Unable to save changes." } }, { status: 503 }));
  await waitFor(() => assert.match(view.getByRole("alert").textContent!, /draft has been kept/));
  assert.equal((view.getByLabelText("Name") as HTMLInputElement).value, "My corrected name");
  assert.equal(saved, false);
  fireEvent.click(view.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.equal(saved, true));
  assert.equal(calls, 2);
  assert.deepEqual(extraction, original);
});

test("permanent deletion requires a second explicit confirmation and cancel performs no mutation", async () => {
  const calls: { method?: string; body: unknown }[] = [];
  let completed = false;
  globalThis.fetch = async (_input, init) => {
    calls.push({ method: init?.method, body: JSON.parse(String(init?.body)) });
    return Response.json({ success: true });
  };
  const view = render(createElement(CardActionControls, { id: "card-id", archived: false, onCompleted: deleted => { completed = deleted; } }));
  fireEvent.click(view.getByRole("button", { name: "Delete permanently" }));
  assert.equal(calls.length, 0);
  assert.ok(view.getByRole("dialog", { name: "Permanently delete this card?" }));
  fireEvent.click(view.getByRole("button", { name: "Cancel" }));
  assert.equal(calls.length, 0);
  fireEvent.click(view.getByRole("button", { name: "Delete permanently" }));
  fireEvent.click(view.getByRole("button", { name: "Confirm permanent deletion" }));
  await waitFor(() => assert.equal(completed, true));
  assert.deepEqual(calls, [{ method: "DELETE", body: { confirmed: true } }]);
});
test("archive/restore disable duplicate operations and show controlled session or storage failures", async () => {
  for (const archived of [false, true]) {
    let calls = 0;
    let finish: ((value: Response) => void) | undefined;
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)), { operation: archived ? "restore" : "archive" });
      return new Promise(resolve => { finish = resolve; });
    };
    const view = render(createElement(CardActionControls, { id: "card-id", archived, onCompleted: () => assert.fail("Must not complete") }));
    const button = view.getByRole("button", { name: archived ? "Restore card" : "Archive card" });
    fireEvent.click(button); fireEvent.click(button);
    assert.equal(calls, 1);
    assert.equal((button as HTMLButtonElement).disabled, true);
    finish!(Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Your session has expired." } }, { status: 401 }));
    await waitFor(() => assert.match(view.getByRole("alert").textContent!, /session has expired/));
    assert.ok(view.getByRole("link", { name: "Sign in in a new tab" }));
    assert.equal((button as HTMLButtonElement).disabled, false);
    view.unmount();
  }
});

test("management errors never display upstream messages, malformed output or network diagnostics", async () => {
  for (const response of [
    Response.json({ success: false, error: { code: "OPERATION_FAILED", message: "private card content and secret" } }, { status: 503 }),
    Response.json({ success: false, error: { code: "unknown", message: "private card content and secret" } }, { status: 503 }),
    new Response("private stack trace", { status: 500 }),
  ]) {
    globalThis.fetch = async (_input, init) => { assert.ok(init?.signal); return response; };
    await assert.rejects(cardOperation("card", "PATCH", { operation: "archive" }), /Reload to check its status/);
  }
  globalThis.fetch = async () => { throw new Error("private network diagnostic"); };
  await assert.rejects(cardOperation("card", "DELETE", { confirmed: true }), /Reload to check its status/);
});
