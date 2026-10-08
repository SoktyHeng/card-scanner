import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { SavedCardFields } from "../components/cards/saved-card-fields";
import { hasFieldValue } from "../lib/cards/field-value";
import { reviewFieldOrder } from "../lib/cards/review";

afterEach(cleanup);
test("empty values include null, undefined, empty and whitespace without changing meaningful display strings", () => {
  for (const value of [null, undefined, "", " \t\r\n", "\u00a0"]) assert.equal(hasFieldValue(value), false);
  for (const value of ["0", "សុខា", "  Name  "]) assert.equal(hasFieldValue(value), true);
});

test("saved details show only populated standard/custom fields and pack responsive grids", () => {
  const fields = reviewFieldOrder.map(key => ({ key, value: key === "name" ? " John " : key === "phone" ? "+855 123" : key === "company" ? " \t" : null }));
  const extraFields = [{ key: "empty", label: "Hidden", value: " " }, { key: "gold", label: "Tier", value: "Gold" }, { key: "unknown", label: " ", value: "ABC-7788" }];
  const source = structuredClone({ fields, extraFields });
  const view = render(createElement(SavedCardFields, { fields, extraFields }));
  assert.ok(view.getByText("Name")); assert.ok(view.getByText("Phone"));
  assert.equal(view.queryByText("Company"), null);
  assert.equal(view.queryByText("Hidden"), null);
  assert.equal(view.queryByText("Not provided"), null);
  assert.ok(view.getByText("Tier")); assert.ok(view.getByText("Unknown field"));
  assert.equal(view.container.querySelectorAll("dd").length, 4);
  assert.ok(view.container.querySelector("dl")?.classList.contains("sm:grid-cols-2"));
  assert.deepEqual({ fields, extraFields }, source);
});

test("fully empty details hide sections and offer manual entry; unavailable data still reports an error", () => {
  const fields = reviewFieldOrder.map((key, index) => ({ key, value: [null, undefined, "", " \n"][index % 4] }));
  const view = render(createElement(SavedCardFields, { fields, extraFields: [{ key: "empty", value: null }] }));
  assert.ok(view.getByText(/Choose Edit to add fields manually/));
  assert.equal(view.container.querySelector("dl"), null);
  assert.equal(view.queryByText("Additional fields"), null);
  view.rerender(createElement(SavedCardFields, { fields, extraFields: [], extraFieldsUnavailable: true }));
  assert.ok(view.getByRole("alert"));
});

test("fully populated details retain every standard field", () => {
  const view = render(createElement(SavedCardFields, { fields: reviewFieldOrder.map(key => ({ key, value: key })), extraFields: [] }));
  assert.equal(view.container.querySelectorAll("dd").length, reviewFieldOrder.length);
  assert.equal(view.queryByText("Additional fields"), null);
});
