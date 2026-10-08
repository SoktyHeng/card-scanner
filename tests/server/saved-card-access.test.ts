import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createCardSaveStore } from "../../lib/cards/save-store";
import { getSavedCard, SIGNED_IMAGE_SECONDS } from "../../lib/cards/card-detail";
import type { Database, CardRow } from "../../types/database";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const path = `${owner}/${id}/original.png`;
const row: CardRow = {
  id, user_id: owner, name: "Saved name", company: null, job_title: null, department: null,
  email: null, phone: null, secondary_phone: null, website: null, card_number: null,
  address: null, card_type: null, raw_ocr_text: "original source", ai_extraction: null,
  extra_fields: [{ label: "Tier", key: "tier", value: "Gold", confidence: null }],
  ai_confidence: null, scan_status: "completed", original_image_path: path,
  is_archived: false, created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z",
};
function client(request: typeof fetch) {
  return createClient<Database>("https://example.supabase.co", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: request },
  });
}
function urlOf(input: Parameters<typeof fetch>[0]) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

test("saved detail scopes the read to owner and signs only that card's private path temporarily", async () => {
  let signed = 0;
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
    if (url.pathname === "/rest/v1/cards") {
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      return Response.json([row]);
    }
    signed++;
    assert.equal(url.pathname, `/storage/v1/object/sign/card-images/${path}`);
    assert.equal(JSON.parse(String(init?.body)).expiresIn, SIGNED_IMAGE_SECONDS);
    return Response.json({ signedURL: `/object/sign/card-images/${path}?token=temporary` });
  });
  const result = await getSavedCard(supabase, owner, id);
  assert.equal(result?.card.name, "Saved name");
  assert.equal(result?.extraFields[0].confidence, null);
  assert.match(result?.imageUrl ?? "", /token=temporary/);
  assert.equal(signed, 1);
  assert.equal(await getSavedCard(supabase, owner, "invalid-id"), null);
  assert.equal(signed, 1);
});

test("missing/other-user cards and invalid stored paths never generate signed URLs", async () => {
  let storageCalls = 0;
  const supabase = client(async input => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    if (url.pathname !== "/rest/v1/cards") { storageCalls++; throw new Error("Unexpected storage access"); }
    const user = url.searchParams.get("user_id");
    return Response.json(user === `eq.${other}` ? [] : [{ ...row, original_image_path: `${other}/${id}/original.png` }]);
  });
  assert.equal(await getSavedCard(supabase, other, id), null);
  const invalid = await getSavedCard(supabase, owner, id);
  assert.equal(invalid?.imageUrl, null);
  assert.equal(invalid?.imageUnavailable, true);
  assert.equal(storageCalls, 0);
});

test("signed-image failure leaves the saved fields available", async () => {
  const supabase = client(async input => urlOf(input).pathname === "/rest/v1/card_images" ? Response.json([]) : urlOf(input).pathname === "/rest/v1/cards"
    ? Response.json([row]) : Response.json({ message: "private-storage-detail" }, { status: 503 }));
  const result = await getSavedCard(supabase, owner, id);
  assert.equal(result?.card.name, "Saved name");
  assert.equal(result?.imageUnavailable, true);
  assert.equal(result?.imageUrl, null);
});

test("save adapter uses session-scoped Supabase operations and never upserts the original", async () => {
  const operations: string[] = [];
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
    const method = init?.method ?? "GET";
    operations.push(method);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer owner-session");
    if (url.pathname === "/rest/v1/cards" && method === "GET") {
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      return Response.json([]);
    }
    if (url.pathname.startsWith("/storage/v1/object/") && method === "POST") {
      assert.equal(headers.get("x-upsert"), "false");
      assert.equal(headers.get("content-type"), "image/png");
      return Response.json({ Key: `card-images/${path}` });
    }
    if (method === "DELETE") return Response.json([{ name: path }]);
    const body = JSON.parse(String(init?.body));
    assert.equal(url.pathname, "/rest/v1/rpc/save_card_with_images");
    assert.equal(body.p_card.user_id, owner);
    return new Response(null, { status: 201 });
  });
  const store = createCardSaveStore(supabase, owner);
  assert.equal(await store.findCard(id), null);
  assert.equal(await store.upload(path, { bytes: new Uint8Array([1]), mimeType: "image/png" }), "uploaded");
  await store.insert({ id, user_id: owner }, [{ card_id: id, side: "front", storage_path: path }]);
  assert.equal(await store.remove(path), true);
  assert.deepEqual(operations, ["GET", "POST", "POST", "DELETE"]);
});

test("save cleanup confirms absence after an empty removal response and keeps uncertain images", async () => {
  for (const outcome of ["absent", "present", "failed"] as const) {
    let checked = false;
    const supabase = client(async (input, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
      const url = urlOf(input);
    if (url.pathname === "/rest/v1/card_images") { assert.equal(url.searchParams.get("card_id"), `eq.${id}`); return Response.json([]); }
      if (init?.method === "DELETE") return Response.json([]);
      checked = true;
      assert.ok(url.pathname.endsWith("/list/card-images"));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.prefix, `${owner}/${id}`);
      assert.equal(body.search, "original.png");
      return outcome === "failed" ? Response.json({ message: "private error" }, { status: 503 })
        : Response.json(outcome === "present" ? [{ name: "original.png" }] : []);
    });
    assert.equal(await createCardSaveStore(supabase, owner).remove(path), outcome === "absent");
    assert.equal(checked, true);
  }
});

test("two-sided saved cards sign both owned paths with temporary URLs", async () => {
  const back = `${owner}/${id}/back.png`;
  const signed: string[] = [];
  const supabase = client(async (input, init) => {
    const url = urlOf(input);
    if (url.pathname === "/rest/v1/cards") {
      assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
      return Response.json([row]);
    }
    if (url.pathname === "/rest/v1/card_images") {
      assert.equal(url.searchParams.get("card_id"), `eq.${id}`);
      return Response.json([{ side: "front", storage_path: path }, { side: "back", storage_path: back }]);
    }
    assert.equal(JSON.parse(String(init?.body)).expiresIn, SIGNED_IMAGE_SECONDS);
    const objectPath = url.pathname.split("/sign/card-images/")[1];
    assert.ok([path, back].includes(objectPath)); signed.push(objectPath);
    return Response.json({ signedURL: `/object/sign/card-images/${objectPath}?token=temporary` });
  });
  const result = await getSavedCard(supabase, owner, id);
  assert.match(result?.imageUrl ?? "", /original.png/);
  assert.match(result?.backImageUrl ?? "", /back.png/);
  assert.deepEqual(signed, [path, back]);
});
