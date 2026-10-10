import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCardListParams, cardListHref, cardDateBounds, DEFAULT_CARD_FILTERS } from "../lib/cards/search";

test("combined filter URLs round-trip punctuation, Khmer, archive state, sorting and pagination", () => {
  const filters = { cardType: "custom,(VIP)", company: "សុខា & O'Brien %_*", from: "2026-10-01", to: "2026-10-10", sort: "name_desc" as const };
  const url = new URL(cardListHref("+855", true, 4, filters), "https://app.test");
  const parsed = parseCardListParams(Object.fromEntries(url.searchParams));
  assert.equal(parsed.error, null); assert.deepEqual(parsed.filters, filters); assert.equal(parsed.page, 4); assert.equal(parsed.archived, true);
  assert.equal(new URL(cardListHref(parsed.query, false, 1, filters), url).searchParams.has("page"), false);
  assert.deepEqual(parseCardListParams(Object.fromEntries(new URL(cardListHref("", true, 1, filters), url).searchParams)).filters, filters);
  assert.equal(cardListHref("", true, 1, DEFAULT_CARD_FILTERS), "/cards?status=archived");
});
test("filter validation fails closed for arrays, invalid dates, reversed ranges and arbitrary sort fields", () => {
  for (const params of [{ sort: "user_id" }, { sort: ["oldest", "newest"] }, { company: ["A", "B"] }, { cardType: "x".repeat(201) }, { company: "A\nB" }, { from: "2026-02-30" }, { to: "2026-13-01" }, { from: "2026-10-11", to: "2026-10-10" }, { from: "0001-01-01" }, { status: ["active", "archived"] }, { status: "all" }])
    assert.ok(parseCardListParams(params).error, JSON.stringify(params));
  assert.equal(parseCardListParams({ from: "2024-02-29", to: "2024-02-29", sort: "oldest" }).error, null);
});
test("Cambodia date filters include the entire end day with exclusive next-day UTC boundary", () => {
  assert.deepEqual(cardDateBounds({ ...DEFAULT_CARD_FILTERS, from: "2026-12-31", to: "2026-12-31" }), { from: "2026-12-30T17:00:00.000Z", until: "2026-12-31T17:00:00.000Z" });
  assert.deepEqual(cardDateBounds({ ...DEFAULT_CARD_FILTERS, to: "2024-02-29" }), { from: null, until: "2024-02-29T17:00:00.000Z" });
  assert.deepEqual(cardDateBounds(DEFAULT_CARD_FILTERS), { from: null, until: null });
});
