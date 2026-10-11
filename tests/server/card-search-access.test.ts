import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getCardList } from "../../lib/cards/card-detail";

const owner = "00000000-0000-4000-8000-000000000001";
test("search sends a parameterized keyword and retains owner/archive/order/range filters", async () => {
  let calls = 0;
  const query = `O'Brien, (VIP) %_\\ &+`;
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
      assert.equal(url.pathname, "/rest/v1/rpc/search_cards");
      assert.deepEqual(JSON.parse(String(init?.body)), { p_query: query });
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(url.searchParams.get("is_archived"), "eq.true");
      assert.equal(url.searchParams.get("offset"), "24");
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
      assert.equal(url.searchParams.has("or"), false);
      assert.ok(!url.searchParams.get("select")?.includes("ai_extraction"));
      return Response.json([]);
    } },
  });
  assert.deepEqual(await getCardList(client, owner, true, 2, query), { cards: [], hasNext: false });
  await assert.rejects(getCardList(client, owner, false, 1, "x".repeat(201)));
  await assert.rejects(getCardList(client, owner, false, 0, "Alice"));
  assert.equal(calls, 1);
});
test("whitespace search uses the existing owner-scoped list, and search outages are controlled", async () => {
  let fail = false;
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      if (!fail) assert.equal(url.pathname, "/rest/v1/cards");
      return fail ? Response.json({ code: "PGRST202", message: "private database detail" }, { status: 404 }) : Response.json([]);
    } },
  });
  assert.deepEqual(await getCardList(client, owner, false, 1, "  "), { cards: [], hasNext: false });
  fail = true;
  await assert.rejects(getCardList(client, owner, false, 1, "Alice"), /Unable to load your cards/);
});

test("combined exact filters and inclusive Cambodia dates use allowlisted stable orders on both list sources", async () => {
  const { DEFAULT_CARD_FILTERS } = await import("../../lib/cards/search");
  for (const query of ["", "Alice"]) for (const sort of ["newest", "oldest", "name_asc", "name_desc"] as const) {
    const client = createClient<Database>("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async input => {
      const url = new URL(String(input));
      assert.equal(url.pathname, query ? "/rest/v1/rpc/search_cards" : "/rest/v1/cards");
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(url.searchParams.get("is_archived"), "eq.false");
      assert.equal(url.searchParams.get("company"), `eq.O'Brien, %_* (VIP)`);
      assert.equal(url.searchParams.get("card_type"), "eq.custom_card");
      assert.deepEqual(url.searchParams.getAll("created_at"), ["gte.2026-10-09T17:00:00.000Z", "lt.2026-10-10T17:00:00.000Z"]);
      assert.equal(url.searchParams.get("order"), sort === "newest" ? "created_at.desc,id.desc" : sort === "oldest" ? "created_at.asc,id.asc" : `name.${sort === "name_asc" ? "asc" : "desc"}.nullslast,created_at.desc,id.desc`);
      assert.equal(url.searchParams.get("offset"), "24"); assert.equal(url.searchParams.get("limit"), "25");
      return Response.json([]);
    } } });
    await getCardList(client, owner, false, 2, query, { ...DEFAULT_CARD_FILTERS, company: "O'Brien, %_* (VIP)", cardType: "custom_card", from: "2026-10-10", to: "2026-10-10", sort });
  }
});

test("tag and favorite queries remain parameterized, owner-scoped and paginated with existing filters", async () => {
  const {DEFAULT_CARD_FILTERS} = await import("../../lib/cards/search");
  const client = createClient<Database>("https://example.supabase.co","test-key",{auth:{persistSession:false},global:{fetch:async (input,init)=>{
    const url = new URL(String(input));
    assert.equal(url.pathname,"/rest/v1/rpc/filter_cards");
    assert.deepEqual(JSON.parse(String(init?.body)),{p_query:"ខ្មែរ &+",p_tag:"O'Brien VIP",p_favorites:true});
    assert.equal(url.searchParams.get("user_id"),`eq.${owner}`);
    assert.equal(url.searchParams.get("is_archived"),"eq.true");
    assert.equal(url.searchParams.get("company"),"eq.Example");
    assert.equal(url.searchParams.get("offset"),"24");
    assert.equal(url.searchParams.get("limit"),"25");
    assert.equal(url.searchParams.get("order"),"created_at.asc,id.asc");
    return Response.json([]);
  }}});
  assert.deepEqual(await getCardList(client,owner,true,2,"ខ្មែរ &+",{...DEFAULT_CARD_FILTERS,tag:"O'Brien VIP",favorites:"1",sort:"oldest",company:"Example"}),{cards:[],hasNext:false});
});
