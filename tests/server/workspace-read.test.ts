import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { createWorkspaceReadHandler } from "../../lib/cards/workspace-read-handler";
const userId = "00000000-0000-4000-8000-000000000001";
test("workspace reads require authentication, validate filters/IDs and reject forged owner or repeated parameters", async () => {
  let calls = 0;
  const supabase = createClient<Database>("https://example.supabase.co", "public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => { calls++; return Response.json([]); } },
  });
  const request = (query: string) => new Request(`https://app.example/api/workspace?${query}`);
  assert.equal((await createWorkspaceReadHandler(async () => null)(request("type=cards"))).status, 401);
  const read = createWorkspaceReadHandler(async () => ({ userId, supabase }));
  for (const query of ["type=detail&id=invalid", "type=cards&user_id=forged", "type=cards&q=a&q=b", "type=cards&page=0", "type=cards&sort=wrong", "type=cards&from=2026-12-01&to=2026-01-01", "type=unknown"]) assert.equal((await read(request(query))).status, 400);
  assert.equal(calls, 0);
});
test("lists, detail and dashboard queries stay owner-scoped, return private no-store responses and hide failures", async () => {
  let calls = 0;
  const supabase = createClient<Database>("https://example.supabase.co", "public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer owner-session" }, fetch: async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("user_id"), `eq.${userId}`);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer owner-session");
      return init?.method === "HEAD" ? new Response(null, { headers: { "content-range": "*/0" } }) : Response.json([]);
    } },
  });
  const read = createWorkspaceReadHandler(async () => ({ userId, supabase }));
  for (const type of ["cards", "dashboard"]) {
    const response = await read(new Request(`https://app.example/api/workspace?type=${type}`));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).owner, userId);
  }
  assert.equal((await read(new Request(`https://app.example/api/workspace?type=detail&id=${userId}`))).status, 404);
  assert.equal(calls, 6);
  const fail = createWorkspaceReadHandler(async () => { throw new Error("Private auth diagnostics"); });
  const response = await fail(new Request("https://app.example/api/workspace?type=cards"));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("Private auth"));
});
