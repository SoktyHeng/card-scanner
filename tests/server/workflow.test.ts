import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { CardRow, Database } from "../../types/database";
import { createExtractionHandler } from "../../lib/ai/extraction-handler";
import { createExtractionLimit } from "../../lib/ai/extraction-limit";
import { createSaveCardHandler } from "../../lib/cards/save-handler";
import { createCardSaveStore } from "../../lib/cards/save-store";
import { createManagementHandler } from "../../lib/cards/management-handler";
import { getSavedCard, getCardList } from "../../lib/cards/card-detail";
import { createReviewDraft, editStandardField, validateReviewDraft } from "../../lib/cards/review";
import { businessCard } from "../fixtures/extraction";

// Actual handlers and SDK with a deterministic Data/Storage API fixture.
// This does not replace the real RLS tests or live credential/device checks.
test("scan → review → save → detail → edit → archive → restore → delete preserves source and cleans storage", async () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const rows = new Map<string, CardRow>();
  const images = new Set<string>();
  const png = await sharp({ create: { width: 20, height: 12, channels: 3, background: "white" } }).png().toBuffer();
  const supabase = createClient<Database>("https://example.supabase.co", "public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: async (input, init) => {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method ?? "GET";
      if (url.pathname === "/rest/v1/card_images") return Response.json([]);
      if (url.pathname === "/rest/v1/rpc/save_card_with_images") {
        const payload = JSON.parse(String(init?.body));
        const record = payload.p_card as CardRow;
        assert.equal(record.user_id, owner);
        assert.equal(payload.p_images.length, 1);
        rows.set(record.id, { ...record, created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z" });
        return Response.json(record.id);
      }
      if (url.pathname === "/rest/v1/cards") {
        if (method === "POST") {
          const record = JSON.parse(String(init?.body)) as CardRow;
          assert.equal(record.user_id, owner);
          rows.set(record.id, { ...record, created_at: "2026-10-07T00:00:00Z", updated_at: "2026-10-07T00:00:00Z" });
          return new Response(null, { status: 201 });
        }
        assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
        let selected = [...rows.values()];
        for (const id of url.searchParams.getAll("id")) selected = selected.filter(row => id.startsWith("neq.") ? row.id !== id.slice(4) : row.id === id.slice(3));
        if (url.searchParams.has("is_archived")) selected = selected.filter(row => row.is_archived === (url.searchParams.get("is_archived") === "eq.true"));
        if (url.searchParams.has("updated_at")) selected = selected.filter(row => row.updated_at === url.searchParams.get("updated_at")!.slice(3));
        if (method === "PATCH") for (const row of selected) Object.assign(row, JSON.parse(String(init?.body)), { updated_at: new Date(Date.parse(row.updated_at) + 1000).toISOString() });
        if (method === "DELETE") for (const row of selected) rows.delete(row.id);
        return Response.json(selected);
      }
      if (url.pathname === "/storage/v1/object/sign/card-images") {
        const body = JSON.parse(String(init?.body)) as { paths: string[] };
        return Response.json(body.paths.map(path => ({ path, error: null, signedURL: "/object/sign/card-images/temporary?token=test" })));
      }
      if (url.pathname.includes("/object/sign/")) return Response.json({ signedURL: "/object/sign/card-images/temporary?token=test" });
      if (method === "DELETE") {
        const paths = (JSON.parse(String(init?.body)) as { prefixes: string[] }).prefixes;
        for (const path of paths) { assert.ok(path.startsWith(`${owner}/`)); images.delete(path); }
        return Response.json(paths.map(name => ({ name })));
      }
      const path = decodeURIComponent(url.pathname.split("/object/card-images/")[1]);
      assert.ok(path.startsWith(`${owner}/`));
      assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
      images.add(path);
      return Response.json({ Key: `card-images/${path}` });
    } },
  });
  const file = new File([new Uint8Array(png)], "camera.png", { type: "image/png" });
  const form = new FormData(); form.append("image", file);
  const extraction = await createExtractionHandler({ authenticate: async () => owner, acquire: createExtractionLimit(), extract: async () => businessCard() })(new Request("http://localhost/api/cards/extract", { method: "POST", body: form }));
  assert.equal(extraction.status, 200);
  const source = (await extraction.json()).data;
  const review = validateReviewDraft(editStandardField(createReviewDraft(source), "name", "Corrected scan"));
  assert.ok(review.success);
  const saveForm = new FormData(); saveForm.append("image", file);
  saveForm.append("data", JSON.stringify({ submissionId: "00000000-0000-4000-8000-000000000003", reviewConfirmed: true, aiExtraction: source, reviewedData: review.data }));
  const saved = await createSaveCardHandler(async () => ({ userId: owner, store: createCardSaveStore(supabase, owner) }))(new Request("http://localhost/api/cards", { method: "POST", body: saveForm }));
  assert.equal(saved.status, 201);
  const { id } = await saved.json();
  const detail = await getSavedCard(supabase, owner, id);
  assert.equal(detail?.card.name, "Corrected scan");
  assert.deepEqual(detail?.card.ai_extraction, source);
  assert.equal(detail?.card.raw_ocr_text, source.rawText);
  assert.ok(detail?.imageUrl);
  const manage = createManagementHandler(async () => ({ userId: owner, supabase }));
  const route = { params: Promise.resolve({ id }) };
  const request = (data: unknown) => new Request(`http://localhost/api/cards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  assert.equal((await manage(request({ operation: "update", expectedUpdatedAt: detail!.card.updated_at, reviewedData: { ...review.data, name: "Edited card" } }), route)).status, 200);
  assert.deepEqual(rows.get(id)?.ai_extraction, source);
  assert.equal((await manage(request({ operation: "archive" }), route)).status, 200);
  assert.equal((await getCardList(supabase, owner, false, 1)).cards.length, 0);
  assert.equal((await getCardList(supabase, owner, true, 1)).cards.length, 1);
  assert.equal((await manage(request({ operation: "restore" }), route)).status, 200);
  assert.equal((await getCardList(supabase, owner, false, 1)).cards.length, 1);
  assert.equal((await createManagementHandler(async () => ({ userId: owner, supabase }), true)(request({ confirmed: true }), route)).status, 200);
  assert.equal(rows.size, 0);
  assert.equal(images.size, 0);
});
