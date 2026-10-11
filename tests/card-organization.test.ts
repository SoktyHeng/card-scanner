import "./fixtures/dom";
import assert from "node:assert/strict";
import {afterEach, test} from "node:test";
import {createElement} from "react";
import {cleanup, fireEvent, render, waitFor} from "@testing-library/react";
import {CardOrganization} from "../components/cards/card-organization";
import {organizationSchema, tagNameSchema} from "../lib/cards/organization-schema";
import {cardListHref, parseCardListParams} from "../lib/cards/search";
const originalFetch = globalThis.fetch;
afterEach(() => {cleanup(); globalThis.fetch = originalFetch;});
const id = "00000000-0000-4000-8000-000000000016";
const updatedAt = "2026-10-12T01:02:03.123456Z";
const input = {operation: "organize" as const, expectedUpdatedAt: updatedAt, notes: "ខ្មែរ\n<script>alert(1)</script>", favorite: true, tags: ["VIP"]};
test("organization validates bounded strict metadata while preserving multiline notes and normalizing tags", () => {
  assert.equal(organizationSchema.parse(input).notes, input.notes);
  assert.equal(tagNameSchema.parse("  e\u0301  "), "é");
  for (const changes of [{notes: "x".repeat(10001)}, {tags: Array(21).fill("VIP")}, {tags: ["x\u0001y"]}, {tags: ["x".repeat(51)]}, {expectedUpdatedAt: "invalid"}, {user_id: id}, {raw_ocr_text: "forged"}]) {
    assert.equal(organizationSchema.safeParse({...input, ...changes}).success, false);
  }
});
test("organization filters preserve combined search, archive, sorting and pagination", () => {
  const state = parseCardListParams({q: "ខ្មែរ & VIP", tag: "VIP", favorites: "1", status: "archived", sort: "oldest", company: "Example", page: "4"});
  const url = new URL(cardListHref(state.query, state.archived, state.page, state.filters), "https://example.com");
  assert.deepEqual(parseCardListParams(Object.fromEntries(url.searchParams)), state);
  for (const params of [{tag: ["VIP"]}, {favorites: "true"}, {tag: "x".repeat(51)}]) assert.ok(parseCardListParams(params).error);
});
test("organization safely renders user text, deduplicates tags, preserves edits on conflict and uses the save receipt revision", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
    return bodies.length === 1 ? Response.json({success:false,error:{code:"CONFLICT",message:"internal"}},{status:409}) : Response.json({success:true,updatedAt:"2026-10-12T01:03:04.654321Z"});
  };
  const view = render(createElement(CardOrganization, {id,updatedAt,notes:input.notes,favorite:false,tags:["VIP", "<script>unsafe</script>"]}));
  assert.equal(view.container.querySelector("script"), null);
  fireEvent.change(view.getByLabelText("Tag name"), {target:{value:"vip"}});
  fireEvent.click(view.getByRole("button",{name:"Add tag"}));
  assert.match(view.getByRole("alert").textContent!, /already added/);
  fireEvent.change(view.getByLabelText("Tag name"), {target:{value:"ខ្មែរ"}});
  fireEvent.click(view.getByRole("button",{name:"Add tag"}));
  fireEvent.click(view.getByLabelText("Favorite"));
  fireEvent.change(view.getByLabelText("Personal notes"),{target:{value:input.notes + " edits"}});
  fireEvent.click(view.getByRole("button",{name:"Save organization"}));
  await waitFor(() => assert.match(view.getByRole("alert").textContent!, /card changed/));
  assert.equal((view.getByLabelText("Personal notes") as HTMLTextAreaElement).value, input.notes + " edits");
  assert.equal(bodies[0].expectedUpdatedAt,updatedAt);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ["expectedUpdatedAt","favorite","notes","operation","tags"]);
  fireEvent.click(view.getByRole("button",{name:"Save organization"}));
  await waitFor(() => assert.equal(view.getByRole("status").textContent,"Organization saved."));
  fireEvent.click(view.getByRole("button",{name:"Remove tag VIP"}));
  fireEvent.click(view.getByRole("button",{name:"Save organization"}));
  await waitFor(() => assert.equal(bodies.length,3));
  assert.equal(bodies[2].expectedUpdatedAt,"2026-10-12T01:03:04.654321Z");
  assert.deepEqual(bodies[2].tags,["<script>unsafe</script>","ខ្មែរ"]);
});
