import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getDashboard } from "../../lib/cards/dashboard";
import { cardDateBounds, DEFAULT_CARD_FILTERS } from "../../lib/cards/search";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
test("dashboard counts only owner records within the displayed Cambodia day, including archived scans and excluding next midnight", async () => {
  const fixtures = [
    {user_id: owner, created_at: "2026-12-31T16:59:59.999Z", is_archived: false},
    {user_id: owner, created_at: "2026-12-31T17:00:00.000Z", is_archived: false},
    {user_id: owner, created_at: "2027-01-01T16:59:59.999Z", is_archived: true},
    {user_id: owner, created_at: "2027-01-01T17:00:00.000Z", is_archived: false},
    {user_id: other, created_at: "2026-12-31T18:00:00.000Z", is_archived: false},
  ];
  for (const [now, day, expected] of [
    ["2026-12-31T16:59:59.999Z", "2026-12-31", 1],
    ["2026-12-31T17:00:00.000Z", "2027-01-01", 2],
  ] as const) {
    let dailyQueries = 0;
    const supabase = createClient<Database>("https://example.supabase.co", "public-key", {
      auth: {persistSession: false, autoRefreshToken: false},
      global: {fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("user_id"), `eq.${owner}`);
        if (init?.method !== "HEAD") return Response.json([]);
        let rows = fixtures.filter(row => row.user_id === owner);
        const dates = url.searchParams.getAll("created_at");
        if (dates.length) {
          dailyQueries++;
          const bounds = cardDateBounds({...DEFAULT_CARD_FILTERS, from: day, to: day});
          assert.deepEqual(dates, [`gte.${bounds.from}`, `lt.${bounds.until}`]);
          assert.equal(url.searchParams.has("is_archived"), false);
          rows = rows.filter(row => row.created_at >= bounds.from! && row.created_at < bounds.until!);
        } else rows = rows.filter(row => String(row.is_archived) === url.searchParams.get("is_archived")?.slice(3));
        return new Response(null, {headers: {"content-range": `*/${rows.length}`}});
      }},
    });
    const data = await getDashboard(supabase, owner, new Date(now));
    assert.equal(data.scannedToday, expected);
    assert.equal(data.total, 3);
    assert.equal(data.archived, 1);
    assert.equal(dailyQueries, 1);
  }
});
