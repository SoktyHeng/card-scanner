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
