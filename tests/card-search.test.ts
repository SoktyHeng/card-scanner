import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CardSearchForm } from "../components/cards/card-search";
import { cardListHref, cardSearchQuerySchema, parseCardListParams } from "../lib/cards/search";

// React's progressive form handling constructs FormData from the DOM form.
// Node's fetch FormData has no HTMLFormElement overload.
Object.defineProperty(globalThis, "FormData", { configurable: true, value: window.FormData });

afterEach(cleanup);
test("search validates and trims input without interpreting punctuation or wildcard characters", () => {
  assert.equal(cardSearchQuerySchema.parse("  "), "");
  assert.equal(cardSearchQuerySchema.parse("  សុខា +855  "), "សុខា +855");
  for (const query of ["%", "_", "\\", "*", `O'Brien, (VIP) \"quoted\"`, "x);drop table cards;--"])
    assert.equal(cardSearchQuerySchema.parse(query), query);
  assert.equal(cardSearchQuerySchema.safeParse("x".repeat(201)).success, false);
  assert.equal(cardSearchQuerySchema.safeParse("one\u0000two").success, false);
  assert.equal(cardSearchQuerySchema.safeParse("one\ntwo").success, false);
  assert.equal(parseCardListParams({ q: ["one", "two"] }).error !== null, true);
  assert.equal(parseCardListParams({ q: "x".repeat(201) }).error !== null, true);
});
test("URL state preserves search/filter through pagination and resets page for search/filter/clear", () => {
  const query = `+855 & O'Brien, %_\\ #`;
  const href = cardListHref(query, true, 3);
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("q"), query);
  assert.equal(url.searchParams.get("status"), "archived");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(new URL(cardListHref(query, true), url).searchParams.has("page"), false);
  assert.equal(cardListHref("", true), "/cards?status=archived");
  assert.equal(cardListHref("", false), "/cards");
  assert.equal(new URL(cardListHref(query, false, 4), url).searchParams.get("q"), query);
  assert.deepEqual(parseCardListParams({ q: "  Alice  ", status: "archived", page: "3" }), { query: "Alice", archived: true, page: 3, error: null });
  for (const page of ["-1", "1.2", "1e2", "100001", "bad", ["1", "2"]]) assert.equal(parseCardListParams({ page }).page, 1);
});
test("accessible search submits and clears with the archive filter and no stale pagination", async () => {
  const urls: string[] = [];
  const view = render(createElement(CardSearchForm, { query: "Original", archived: true, navigate: href => { urls.push(href); } }));
  assert.equal(view.getByRole("search").getAttribute("method"), "get");
  const input = view.getByLabelText("Search cards");
  assert.equal(input.getAttribute("type"), "search");
  assert.equal(input.getAttribute("maxlength"), "200");
  fireEvent.change(input, { target: { value: "  +855 %  " } });
  fireEvent.submit(view.getByRole("search"));
  await waitFor(() => assert.equal(urls[0], cardListHref("+855 %", true)));
  fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  await waitFor(() => assert.equal(urls[1], "/cards?status=archived"));
  assert.equal((input as HTMLInputElement).value, "");
  fireEvent.change(input, { target: { value: "x".repeat(201) } });
  fireEvent.submit(view.getByRole("search"));
  assert.match(view.getByRole("alert").textContent!, /200 characters/);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(urls.length, 2);
});
test("search announces pending navigation and prevents duplicate submissions", async () => {
  let finish: (() => void) | undefined;
  let calls = 0;
  const view = render(createElement(CardSearchForm, { query: "", archived: false, navigate: () => {
    calls++;
    return new Promise<void>(resolve => { finish = resolve; });
  } }));
  fireEvent.change(view.getByLabelText("Search cards"), { target: { value: "Alice" } });
  fireEvent.click(view.getByRole("button", { name: "Search" }));
  await waitFor(() => assert.ok(view.getByRole("status").textContent?.includes("Searching your cards")));
  const button = view.getByRole("button", { name: "Searching…" });
  assert.equal((button as HTMLButtonElement).disabled, true);
  fireEvent.click(button);
  fireEvent.submit(view.getByRole("search"));
  assert.equal(calls, 1);
  finish!();
  await waitFor(() => assert.equal((view.getByRole("button", { name: "Search" }) as HTMLButtonElement).disabled, false));
});
