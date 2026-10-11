import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database, CardRow } from "../../types/database";
import { mutateCard, permanentlyDeleteCard } from "../../lib/cards/management-service";
import { createManagementHandler } from "../../lib/cards/management-handler";
import { savedCardDraft } from "../../lib/cards/management-schema";
import { getCardList } from "../../lib/cards/card-detail";

const owner = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000003";
const path = `${owner}/${id}/original.png`;
const row: CardRow = {
  id, user_id: owner, name: "Corrected name", company: null, job_title: null, department: null,
  email: null, phone: null, secondary_phone: null, website: null, card_number: null,
  address: null, card_type: null, raw_ocr_text: "source", ai_extraction: { name: "AI name" },
  extra_fields: [{ label: "Tier", key: "tier", value: "Gold", confidence: null }],
  ai_confidence: 0.8, scan_status: "completed", original_image_path: path,
  notes: "", is_favorite: false, is_archived: false, created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z",
};

test("two-sided deletion retains the archived card after back cleanup failure and safely retries both paths", async () => {
  const back = `${owner}/${id}/back.png`;
  const objects = new Set([path, back]);
  let failBack = true, deleted = false;
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") {
      assert.equal(url.searchParams.get("card_id"), `eq.${id}`);
      return Response.json([{ side: "front", storage_path: path }, { side: "back", storage_path: back }]);
    }
    if (url.pathname === "/rest/v1/cards") {
      owned(url, init);
      if (init?.method === "PATCH") return Response.json([{ original_image_path: path, updated_at: row.updated_at }]);
      deleted = true; return Response.json([{ id }]);
    }
    if (url.pathname.includes("/list/")) return Response.json([]);
    const target = JSON.parse(String(init?.body)).prefixes[0] as string;
    assert.ok([path, back].includes(target));
    if (target === back && failBack) return Response.json({ message: "failure" }, { status: 503 });
    return Response.json(objects.delete(target) ? [{ name: target }] : []);
  });
  await assert.rejects(permanentlyDeleteCard(supabase, owner, id), /Unable to remove/);
  assert.equal(deleted, false); assert.deepEqual([...objects], [back]);
  failBack = false;
  await permanentlyDeleteCard(supabase, owner, id);
  assert.equal(objects.size, 0); assert.equal(deleted, true);
});
function client(request: typeof fetch) {
  return createClient<Database>("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: request },
  });
}
function urlOf(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}
function owned(url: URL, init?: RequestInit) {
  assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
  assert.equal(url.searchParams.get("id"), `eq.${id}`);
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
}
test("editing validates corrected data, uses the saved version, and cannot alter scan/AI/owner/image columns", async () => {
  const draft = savedCardDraft(row);
  assert.equal(draft.name, "Corrected name");
  assert.equal(draft.fieldConfidences.name, null);
  const snapshot = structuredClone(row);
  let calls = 0;
  const supabase = client(async (input, init) => {
    calls++; const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); } owned(url, init);
    assert.equal(init?.method, "PATCH");
    assert.equal(url.searchParams.get("updated_at"), `eq.${row.updated_at}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.name, "សុខា");
    assert.deepEqual(body.extra_fields, [{ label: "Tier", key: "tier", value: "Platinum", confidence: null }]);
    for (const key of ["user_id", "id", "raw_ocr_text", "ai_extraction", "ai_confidence", "original_image_path", "scan_status", "created_at", "is_archived"]) assert.ok(!(key in body));
    return Response.json([{ id }]);
  });
  draft.name = "សុខា"; draft.extraFields[0].value = "Platinum";
  await mutateCard(supabase, owner, id, { operation: "update", expectedUpdatedAt: row.updated_at, reviewedData: draft });
  assert.deepEqual(row, snapshot);
  draft.email = "invalid";
  await assert.rejects(mutateCard(supabase, owner, id, { operation: "update", expectedUpdatedAt: row.updated_at, reviewedData: draft }));
  assert.equal(calls, 1);
});
test("archive and restore update only the archive flag through the owner-scoped client", async () => {
  const flags: boolean[] = [];
  const supabase = client(async (input, init) => {
    owned(urlOf(input), init);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ["is_archived"]); flags.push(body.is_archived);
    return Response.json([{ id }]);
  });
  await mutateCard(supabase, owner, id, { operation: "archive" });
  await mutateCard(supabase, owner, id, { operation: "restore" });
  assert.deepEqual(flags, [true, false]);
});
test("stale editing returns a conflict; missing or another owner's cards return the same not-found error", async () => {
  for (const exists of [true, false]) {
    const supabase = client(async (input, init) => {
      owned(urlOf(input), init);
      return Response.json(init?.method === "GET" && exists ? [{ id }] : []);
    });
    await assert.rejects(mutateCard(supabase, owner, id, { operation: "update", expectedUpdatedAt: row.updated_at, reviewedData: savedCardDraft(row) }), exists ? /changed since/ : /not found/);
    await assert.rejects(permanentlyDeleteCard(supabase, owner, id), /not found/);
  }
});
test("permanent deletion archives, removes only the original private image, then deletes the owner record", async () => {
  const operations: string[] = [];
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    if (url.pathname.startsWith("/rest/")) {
      owned(url, init); operations.push(init?.method ?? "GET");
      if (init?.method === "PATCH") {
        assert.deepEqual(JSON.parse(String(init.body)), { is_archived: true });
        return Response.json([{ original_image_path: path, updated_at: row.updated_at }]);
      }
      assert.equal(url.searchParams.get("updated_at"), `eq.${row.updated_at}`);
      return Response.json([{ id }]);
    }
    operations.push("storage");
    assert.deepEqual(JSON.parse(String(init?.body)), { prefixes: [path] });
    return Response.json([{ name: path }]);
  });
  await permanentlyDeleteCard(supabase, owner, id);
  assert.deepEqual(operations, ["PATCH", "storage", "DELETE"]);
});
test("image cleanup failure and invalid image ownership retain the archived record", async () => {
  for (const invalidPath of [false, true]) {
    let deleted = false;
    const supabase = client(async (input, init) => {
      const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
      if (url.pathname.startsWith("/rest/")) {
        owned(url, init);
        if (init?.method === "DELETE") deleted = true;
        return Response.json([{ original_image_path: invalidPath ? `other/${id}/original.png` : path, updated_at: row.updated_at }]);
      }
      assert.equal(invalidPath, false);
      return Response.json({ message: "secret detail" }, { status: 503 });
    });
    await assert.rejects(permanentlyDeleteCard(supabase, owner, id), invalidPath ? /path could not be verified/ : /Unable to remove/);
    assert.equal(deleted, false);
  }
});
test("database failure after image removal reports partial deletion; missing images can be retried safely", async () => {
  for (const fail of [true, false]) {
    let checked = false;
    const supabase = client(async (input, init) => {
      const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
      if (url.pathname.startsWith("/rest/")) {
        owned(url, init);
        if (init?.method === "PATCH") return Response.json([{ original_image_path: path, updated_at: row.updated_at }]);
        return fail ? Response.json({ message: "secret database detail" }, { status: 503 }) : Response.json([{ id }]);
      }
      if (url.pathname.includes("/list/")) { checked = true; return Response.json([]); }
      return Response.json([]);
    });
    if (fail) await assert.rejects(permanentlyDeleteCard(supabase, owner, id), /image was removed, but the card record/);
    else await permanentlyDeleteCard(supabase, owner, id);
    assert.equal(checked, true);
  }
});
test("empty cleanup response cannot delete a record if storage still contains its image", async () => {
  let deleted = false;
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    if (url.pathname.startsWith("/rest/")) {
      if (init?.method === "DELETE") deleted = true;
      return Response.json([{ original_image_path: path, updated_at: row.updated_at }]);
    }
    return Response.json(url.pathname.includes("/list/") ? [{ name: "original.png" }] : []);
  });
  await assert.rejects(permanentlyDeleteCard(supabase, owner, id), /cleanup could not be confirmed/);
  assert.equal(deleted, false);
});
test("card lists are paginated, filter active/archived, and never query AI source payloads", async () => {
  const filters: string[] = [];
  const supabase = client(async input => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
    assert.equal(url.searchParams.get("offset"), "24");
    assert.equal(url.searchParams.get("limit"), "25");
    assert.ok(!url.searchParams.get("select")?.includes("ai_extraction"));
    filters.push(url.searchParams.get("is_archived")!);
    return Response.json([]);
  });
  assert.deepEqual(await getCardList(supabase, owner, false, 2), { cards: [], hasNext: false });
  await getCardList(supabase, owner, true, 2);
  assert.deepEqual(filters, ["eq.false", "eq.true"]);
});
test("mutation handlers reject expired sessions, forged owners, invalid data, unconfirmed deletion and cross-origin requests", async () => {
  let calls = 0;
  const supabase = client(async () => { calls++; return Response.json([{ id }]); });
  const context = { params: Promise.resolve({ id }) };
  const request = (body: unknown, origin = "http://localhost") => new Request(`http://localhost/api/cards/${id}`, { method: "PATCH", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
  const handler = createManagementHandler(async () => ({ userId: owner, supabase }));
  assert.equal((await createManagementHandler(async () => null)(request({}), context)).status, 401);
  for (const body of [{ operation: "archive", user_id: "forged" }, { operation: "update", reviewedData: {} }]) assert.equal((await handler(request(body), context)).status, 400);
  assert.equal((await handler(request({ operation: "archive" }, "https://attacker.example"), context)).status, 403);
  assert.equal((await createManagementHandler(async () => ({ userId: owner, supabase }), true)(request({ confirmed: false }), context)).status, 400);
  assert.equal(calls, 0);
  const response = await handler(request({ operation: "restore" }), context);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("cache-control")?.includes("no-store"));
  assert.equal(calls, 1);
});

test("management accepts public LAN Host and rejects malformed content types, timestamps and oversized streamed bodies", async () => {
  let calls = 0;
  const supabase = client(async () => { calls++; return Response.json([{ id }]); });
  const handler = createManagementHandler(async () => ({ userId: owner, supabase }));
  const route = { params: Promise.resolve({ id }) };
  const request = (body: unknown, contentType = "application/json") => new Request(`http://internal/api/cards/${id}`, { method: "PATCH", headers: { origin: "http://192.168.1.121:3000", host: "192.168.1.121:3000", "content-type": contentType }, body: JSON.stringify(body) });
  assert.equal((await handler(request({ operation: "archive" }), route)).status, 200);
  assert.equal((await handler(request({ operation: "archive" }, "application/json-invalid"), route)).status, 400);
  assert.equal((await handler(request({ operation: "update", expectedUpdatedAt: "not a timestamp", reviewedData: savedCardDraft(row) }), route)).status, 400);
  assert.equal((await handler(request("x".repeat(1024 * 1024)), route)).status, 413);
  assert.equal(calls, 1);
});

test("organization handler authenticates RPC metadata, returns exact revision and controls conflict/missing errors", async () => {
  const revision = "2026-10-12T02:03:04.123456Z";
  const body = {operation:"organize",expectedUpdatedAt:row.updated_at,notes:"private ខ្មែរ",favorite:true,tags:["VIP"]};
  let code: string | null = null;
  const supabase = client(async (input, init) => {
    assert.equal(urlOf(input).pathname,"/rest/v1/rpc/organize_card");
    assert.deepEqual(JSON.parse(String(init?.body)), {p_id:id,p_expected:row.updated_at,p_notes:body.notes,p_favorite:true,p_tags:["VIP"]});
    return code ? Response.json({code,message:"sensitive database details"},{status:400}) : Response.json(revision);
  });
  const handler = createManagementHandler(async () => ({supabase,userId:owner}));
  const request = () => new Request(`http://localhost/api/cards/${id}`,{method:"PATCH",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify(body)});
  const route = {params:Promise.resolve({id})};
  assert.deepEqual(await (await handler(request(),route)).json(),{success:true,updatedAt:revision});
  for (const [error,status] of [["PT409",409],["40001",409],["P0002",404],["unexpected",503]] as const) {
    code=error;
    const response = await handler(request(),route);
    assert.equal(response.status,status);
    assert.ok(!(await response.text()).includes("sensitive database"));
  }
});
