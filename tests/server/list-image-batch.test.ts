import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getCardList } from "../../lib/cards/card-detail";

const owner = "00000000-0000-4000-8000-000000000001";
const rows = Array.from({ length: 25 }, (_, index) => {
  const id = `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;
  return { id, name: null, company: null, job_title: null, phone: null, email: null, created_at: "2026-10-11T00:00:00Z", original_image_path: `${owner}/${id}/original.png` };
});

for (const failure of [false, true]) test(`list batches only visible owned images and tolerates storage failure=${failure}`, async () => {
  let calls = 0;
  const data = rows.map((row, index) => ({ ...row, original_image_path: index === 2 ? `other/${row.id}/original.png` : row.original_image_path }));
  const supabase = createClient<Database>("https://example.supabase.co", "public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
      if (url.pathname === "/rest/v1/cards") {
        assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
        return Response.json(data);
      }
      assert.equal(url.pathname, "/storage/v1/object/sign/card-images");
      calls++;
      const body = JSON.parse(String(init?.body)) as { paths: string[]; expiresIn: number };
      assert.deepEqual(body.paths, rows.slice(0, 24).filter((_, index) => index !== 2).map(row => row.original_image_path));
      assert.equal(body.expiresIn, 300);
      if (failure) return Response.json({ message: "outage" }, { status: 503 });
      return Response.json(body.paths.toReversed().map(path => ({ path, error: path === rows[1].original_image_path ? "missing" : null, signedURL: `/object/sign/card-images/${path}?token=test` })));
    } },
  });
  const result = await getCardList(supabase, owner, false, 1);
  assert.equal(calls, 1);
  assert.equal(result.cards.length, 24);
  assert.equal(result.hasNext, true);
  assert.equal(result.cards[1].imageUrl, null);
  assert.equal(result.cards[2].imageUrl, null);
  if (failure) assert.ok(result.cards.every(card => card.imageUrl === null));
  else assert.ok(result.cards[0].imageUrl?.includes(rows[0].original_image_path));
});
