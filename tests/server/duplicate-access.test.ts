import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { findDuplicateCards } from "../../lib/cards/duplicate-check";
import type { DuplicateCandidate, DuplicateInput } from "../../lib/cards/duplicates";
import type { Database } from "../../types/database";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const excluded = "00000000-0000-4000-8000-000000000003";
const input: DuplicateInput = { email: "owner@example.com", phone: null, secondaryPhone: null, cardNumber: null, name: null, company: null };
function row(id: string, user_id = owner): DuplicateCandidate { return { id, user_id, email: "OWNER@example.com", phone: null, secondary_phone: null, card_number: null, name: "Existing", company: null, is_archived: true }; }
function client(fetcher: typeof fetch) { return createClient<Database>("https://example.supabase.co", "public-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: "Bearer owner-session" }, fetch: fetcher } }); }
function requestUrl(value: Parameters<typeof fetch>[0]) { return new URL(typeof value === "string" ? value : value instanceof URL ? value.href : value.url); }

test("duplicate lookup scopes every page to the verified owner and excludes self, with session RLS credentials", async () => {
  let requests = 0;
  const supabase = client(async (url, init) => {
    requests++;
    const query = requestUrl(url).searchParams;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
    assert.equal(query.get("user_id"), `eq.${owner}`);
    assert.equal(query.get("id"), `neq.${excluded}`);
    assert.equal(query.get("is_archived"), null);
    assert.equal(query.get("select"), "id,user_id,email,phone,secondary_phone,card_number,name,company,is_archived");
    return Response.json([row(excluded), row(other, other), row("00000000-0000-4000-8000-000000000004")]);
  });
  assert.deepEqual((await findDuplicateCards(supabase, owner, input, excluded)).map(match => match.id), ["00000000-0000-4000-8000-000000000004"]);
  assert.deepEqual(await findDuplicateCards(supabase, owner, { ...input, email: " " }, excluded), []);
  assert.equal(requests, 1);
});

test("duplicate lookup advances across full pages and controls database failures", async () => {
  const page = Array.from({ length: 200 }, (_, index) => row(`10000000-0000-4000-8000-${String(index).padStart(12, "0")}`));
  let calls = 0;
  const supabase = client(async url => {
    const query = requestUrl(url).searchParams;
    assert.equal(query.get("user_id"), `eq.${owner}`);
    assert.equal(query.get("limit"), "200");
    assert.equal(query.get("order"), "id.asc");
    if (calls++ === 0) { assert.equal(query.get("id"), `neq.${excluded}`); return Response.json(page); }
    assert.deepEqual(query.getAll("id"), [`neq.${excluded}`, `gt.${page.at(-1)!.id}`]);
    return Response.json([row("20000000-0000-4000-8000-000000000001")]);
  });
  assert.equal((await findDuplicateCards(supabase, owner, input, excluded)).length, 201);
  assert.equal(calls, 2);
  await assert.rejects(findDuplicateCards(client(async () => Response.json({ message: "private detail" }, { status: 503 })), owner, input, excluded), /Duplicate lookup failed/);
});
