import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CardReviewForm } from "../components/cards/card-review-form";
import { ConfidenceBadge } from "../components/cards/confidence-badge";
import { businessCard, emptyCard } from "./fixtures/extraction";
import type { ReviewedCard } from "../lib/cards/review";
import { createReviewDraft, reviewFieldOrder, validateReviewDraft } from "../lib/cards/review";

afterEach(cleanup);

test("saved-card editing starts with corrected data instead of AI values and preserves sources", () => {
  const source = businessCard();
  const result = validateReviewDraft(createReviewDraft(source));
  assert.ok(result.success);
  const corrected = structuredClone(result.data);
  corrected.name = "Reviewed name";
  corrected.extraFields[0].value = "User correction";
  corrected.fieldConfidences.name = null;
  corrected.extraFields[0].confidence = null;
  const snapshot = structuredClone({ source, corrected });
  let saved: ReviewedCard | undefined;
  const view = render(createElement(CardReviewForm, { extraction: source, initialData: corrected, editing: true, confirmed: false,
    onConfirm: data => { saved = data; }, onChange: () => {} }));
  assert.equal((view.getByLabelText("Name") as HTMLInputElement).value, "Reviewed name");
  assert.equal((view.getByLabelText("Value for additional field 1") as HTMLInputElement).value, "User correction");
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Updated name" } });
  fireEvent.change(view.getByLabelText("Label for additional field 1"), { target: { value: "Corrected ID" } });
  fireEvent.click(view.getByRole("button", { name: "Save changes" }));
  assert.equal(saved?.name, "Updated name");
  assert.equal(saved?.extraFields[0].label, "Corrected ID");
  assert.equal(saved?.fieldConfidences.name, null);
  assert.equal(view.queryByText(/Nothing has been saved/), null);
  assert.deepEqual({ source, corrected }, snapshot);
});

test("review renders standard fields first, edits/adds/removes extras, and validates before confirmation", async () => {
  const source = businessCard();
  const snapshot = structuredClone(source);
  const confirmed: ReviewedCard[] = [];
  let edits = 0;
  const view = render(createElement(CardReviewForm, { extraction: source, confirmed: false,
    onConfirm: card => confirmed.push(card), onChange: () => { edits++; } }));
  const groups = view.getAllByRole("group");
  assert.ok(groups.findIndex(group => group.textContent?.includes("Standard fields")) < groups.findIndex(group => group.getAttribute("class")?.includes("space-y-4") && group.textContent?.includes("Additional fields")));
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "សុខា" } });
  fireEvent.change(view.getByLabelText("Label for additional field 1"), { target: { value: "Employee ID" } });
  fireEvent.change(view.getByLabelText("Value for additional field 1"), { target: { value: "EMP-2" } });
  fireEvent.click(view.getByRole("button", { name: "Add field" }));
  await waitFor(() => assert.ok(document.activeElement === view.getByLabelText("Label for additional field 2")));
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(confirmed.length, 0);
  assert.match(view.getByRole("alert").textContent!, /Enter a value/);
  assert.equal(view.getByLabelText("Value for additional field 2").getAttribute("aria-invalid"), "true");
  fireEvent.change(view.getByLabelText("Value for additional field 2"), { target: { value: "Gold" } });
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].name, "សុខា");
  assert.equal(confirmed[0].fieldConfidences.name, null);
  assert.equal(confirmed[0].extraFields[0].label, "Employee ID");
  assert.equal(confirmed[0].extraFields[0].value, "EMP-2");
  assert.equal(confirmed[0].extraFields[1].confidence, null);
  fireEvent.click(view.getByRole("button", { name: "Remove field 1" }));
  assert.equal(view.queryByDisplayValue("EMP-2"), null);
  assert.ok(edits >= 6);
  assert.deepEqual(source, snapshot);
});

test("conversion announces conflicts and preserves both values; successful conversion focuses the destination", async () => {
  const view = render(createElement(CardReviewForm, { extraction: businessCard(), confirmed: false,
    onConfirm: () => {}, onChange: () => {} }));
  fireEvent.click(view.getByRole("button", { name: "Convert field 1" }));
  assert.match(view.getByRole("alert").textContent!, /Name already has a value/);
  assert.ok(view.getByDisplayValue("JOHN SMITH"));
  assert.ok(view.getByDisplayValue("EMP-1001"));
  fireEvent.change(view.getByLabelText("Convert additional field 1 to"), { target: { value: "cardNumber" } });
  fireEvent.click(view.getByRole("button", { name: "Convert field 1" }));
  assert.equal((view.getByLabelText("Card number") as HTMLInputElement).value, "EMP-1001");
  assert.equal(view.queryByLabelText("Value for additional field 1"), null);
  await waitFor(() => assert.ok(document.activeElement === view.getByLabelText("Card number")));
});

test("confidence boundaries, unknown fields and empty results remain confirmable", () => {
  const view = render(createElement("div", null,
    ...[0, 0.699, 0.7, 0.899, 0.9, 1, null].map((score, index) => createElement(ConfidenceBadge, { key: index, score }))));
  assert.equal(view.getAllByText(/Low AI confidence/).length, 2);
  assert.equal(view.getAllByText(/Medium AI confidence/).length, 2);
  assert.equal(view.getAllByText(/High AI confidence/).length, 2);
  assert.ok(view.getByText("No AI confidence available"));
  view.unmount();
  let confirmations = 0;
  const source = emptyCard();
  source.extraFields.push({ label: null, key: "unknown_field", value: "ABC-7788", confidence: 0.35 });
  const unknown = render(createElement(CardReviewForm, { extraction: source, confirmed: false, onConfirm: () => { confirmations++; }, onChange: () => {} }));
  assert.ok(unknown.getByText(/Unknown field — review/));
  fireEvent.click(unknown.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(confirmations, 1);
  unknown.unmount();
  const empty = render(createElement(CardReviewForm, { extraction: emptyCard(), confirmed: false, onConfirm: () => { confirmations++; }, onChange: () => {} }));
  assert.ok(empty.getByText(/No readable fields/));
  assert.equal(empty.queryByLabelText("Name"), null);
  fireEvent.click(empty.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(confirmations, 2);
});

test("review/edit hide empty values initially, add standard fields, and retain focused fields when cleared", async () => {
  for (const editing of [false, true]) {
    const source = businessCard();
    source.jobTitle = " \t\n ";
    source.extraFields.push({ label: "Empty source field", key: "empty_source", value: " ", confidence: 0.5 });
    const snapshot = structuredClone(source);
    const view = render(createElement(CardReviewForm, { extraction: source, editing, confirmed: false, onConfirm: () => {}, onChange: () => {} }));
    assert.ok(view.getByLabelText("Name"));
    assert.equal(view.queryByLabelText("Job title"), null);
    assert.equal(view.queryByLabelText("Department"), null);
    assert.equal(view.queryByLabelText("Value for additional field 2"), null);
    fireEvent.change(view.getByLabelText("Field to add"), { target: { value: "standard:department" } });
    fireEvent.click(view.getByRole("button", { name: "Add field" }));
    const department = view.getByLabelText("Department") as HTMLInputElement;
    await waitFor(() => assert.ok(document.activeElement === department));
    fireEvent.change(department, { target: { value: "Finance" } });
    fireEvent.change(department, { target: { value: "   " } });
    assert.ok(document.activeElement === department);
    assert.ok(view.getByLabelText("Department") === department);
    assert.ok(!view.getByLabelText("Field to add").querySelector('option[value="standard:department"]'));
    const name = view.getByLabelText("Name") as HTMLInputElement;
    name.focus();
    fireEvent.change(name, { target: { value: "" } });
    assert.ok(view.getByLabelText("Name") === name);
    assert.ok(document.activeElement === name);
    assert.deepEqual(source, snapshot);
    view.unmount();
  }
});

test("empty cards allow manual standard/custom entry, custom clearing keeps focus and existing validation", async () => {
  for (const editing of [false, true]) {
    let saved: ReviewedCard | undefined;
    const source = emptyCard();
    const view = render(createElement(CardReviewForm, { extraction: source, editing, confirmed: false, onConfirm: data => { saved = data; }, onChange: () => {} }));
    assert.equal(view.queryByText("Standard fields"), null);
    assert.equal(view.queryByText("Additional fields"), null);
    assert.equal(view.queryByText("Original source text"), null);
    assert.ok(view.getByText(/Use Add field/));
    fireEvent.change(view.getByLabelText("Field to add"), { target: { value: "standard:name" } });
    fireEvent.click(view.getByRole("button", { name: "Add field" }));
    fireEvent.change(view.getByLabelText("Name"), { target: { value: "Manual name" } });
    fireEvent.click(view.getByRole("button", { name: "Add field" }));
    await waitFor(() => assert.ok(document.activeElement === view.getByLabelText("Label for additional field 1")));
    fireEvent.change(view.getByLabelText("Label for additional field 1"), { target: { value: "Tier" } });
    const value = view.getByLabelText("Value for additional field 1") as HTMLInputElement;
    value.focus();
    fireEvent.change(value, { target: { value: "Gold" } });
    fireEvent.change(value, { target: { value: "" } });
    assert.ok(document.activeElement === value);
    assert.ok(view.getByLabelText("Value for additional field 1") === value);
    fireEvent.click(view.getByRole("button", { name: editing ? "Save changes" : "Confirm reviewed information" }));
    assert.equal(Boolean(saved), false);
    assert.match(view.getByRole("alert").textContent!, /Enter a value or remove/);
    fireEvent.click(view.getByRole("button", { name: "Remove field 1" }));
    assert.equal(view.queryByText("Additional fields"), null);
    fireEvent.click(view.getByRole("button", { name: editing ? "Save changes" : "Confirm reviewed information" }));
    assert.equal(saved?.name, "Manual name");
    assert.deepEqual(saved?.extraFields, []);
    view.unmount();
  }
});

test("hidden source extras can be revealed explicitly or by validation without losing their indexes/data", async () => {
  const source = businessCard();
  source.extraFields.unshift({ label: "Missing value", key: "missing", value: "", confidence: 0.5 });
  const snapshot = structuredClone(source);
  const view = render(createElement(CardReviewForm, { extraction: source, confirmed: false, onConfirm: () => {}, onChange: () => {} }));
  assert.equal(view.queryByLabelText("Value for additional field 1"), null);
  assert.ok(view.getByLabelText("Value for additional field 2"));
  fireEvent.change(view.getByLabelText("Field to add"), { target: { value: "extra:ai-0" } });
  fireEvent.click(view.getByRole("button", { name: "Add field" }));
  await waitFor(() => assert.ok(document.activeElement === view.getByLabelText("Value for additional field 1")));
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(view.getByLabelText("Value for additional field 1").getAttribute("aria-invalid"), "true");
  assert.deepEqual(source, snapshot);
  view.unmount();
  const implicit = render(createElement(CardReviewForm, { extraction: source, confirmed: false, onConfirm: () => {}, onChange: () => {} }));
  fireEvent.click(implicit.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(implicit.getByLabelText("Value for additional field 1").getAttribute("aria-invalid"), "true");
});

test("fully populated forms show every standard value, while empty corrected edit data takes precedence over AI", () => {
  const source = businessCard();
  for (const key of reviewFieldOrder) { source[key] = key === "email" ? "john@example.com" : `Value for ${key}`; source.fieldConfidences[key] = 0.95; }
  let saved: ReviewedCard | undefined;
  const full = render(createElement(CardReviewForm, { extraction: source, confirmed: false, onConfirm: data => { saved = data; }, onChange: () => {} }));
  assert.equal(full.container.querySelectorAll('input:not([type="hidden"]), textarea').length, reviewFieldOrder.length + 2);
  fireEvent.click(full.getByRole("button", { name: "Confirm reviewed information" }));
  assert.equal(saved?.email, "john@example.com");
  full.unmount();
  const corrected = validateReviewDraft(createReviewDraft(emptyCard()));
  assert.ok(corrected.success);
  const edit = render(createElement(CardReviewForm, { extraction: source, initialData: corrected.data, editing: true, confirmed: false, onConfirm: () => {}, onChange: () => {} }));
  assert.equal(edit.queryByLabelText("Name"), null);
  assert.equal(edit.queryByLabelText("Value for additional field 1"), null);
  assert.ok(edit.getByText(/This card has no populated fields/));
});
