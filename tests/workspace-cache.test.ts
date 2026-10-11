import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { WorkspaceDataBoundary, useWorkspaceData, useReusableImageUrl } from "../components/cache/workspace-cache";
import { MemoryCache } from "../lib/cache/memory-cache";
import { CACHE_EVENT } from "../lib/cache/events";
import { cardOperation } from "../components/cards/card-operation";
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

function Read({ resource }: { resource: string }) {
  const { data, error } = useWorkspaceData<{ count: number }>(resource, 45_000);
  return createElement("p", null, error ?? (data ? `Count ${data.count}` : "Loading"));
}
function shell(cache: MemoryCache, owner: string, resource: string, refresh: () => void = () => {}) {
  const router: AppRouterInstance = { bfcacheId: "test", back() {}, forward() {}, push() {}, replace() {}, prefetch() {}, refresh };
  return createElement(AppRouterContext.Provider, { value: router }, createElement(WorkspaceDataBoundary, { owner, cache }, createElement(Read, { resource })));
}
test("repeat navigation uses memory; query changes and successful mutations reload the matching views", async () => {
  const cache = new MemoryCache(); let calls = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PATCH") return Response.json({ success: true });
    calls++; assert.equal(init?.cache, "no-store");
    return Response.json({ owner: "A", data: { count: calls }, imagesExpireAt: Date.now() + 300_000 });
  };
  const invalidate = () => cache.invalidate(); window.addEventListener(CACHE_EVENT, invalidate);
  const view = render(shell(cache, "A", "type=dashboard"));
  await waitFor(() => assert.ok(view.getByText("Count 1")));
  view.rerender(shell(cache, "A", "type=cards&sort=oldest"));
  await waitFor(() => assert.ok(view.getByText("Count 2")));
  view.rerender(shell(cache, "A", "type=dashboard"));
  assert.ok(view.getByText("Count 1")); assert.equal(calls, 2);
  await act(async () => { await cardOperation("id", "PATCH", { operation: "archive" }); });
  await waitFor(() => assert.ok(view.getByText("Count 3")));
  window.removeEventListener(CACHE_EVENT, invalidate); view.unmount(); cache.dispose();
});
test("a response from another account is never rendered or stored", async () => {
  const cache = new MemoryCache(); let refreshes = 0;
  globalThis.fetch = async () => Response.json({ owner: "B", data: { count: 999 }, imagesExpireAt: Date.now() + 300_000 });
  const view = render(shell(cache, "A", "type=dashboard", () => { refreshes++; }));
  await waitFor(() => assert.equal(refreshes, 1));
  assert.equal(view.queryByText("Count 999"), null);
  assert.equal(cache.get("A:type=dashboard"), undefined);
  view.unmount(); cache.dispose();
});

test("expired views remain visible during a bounded background refresh", async () => {
  let now = Date.now(), calls = 0;
  const cache = new MemoryCache(() => now);
  let complete: (response: Response) => void = () => {};
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return Response.json({ owner: "A", data: { count: 1 } });
    return new Promise(resolve => { complete = resolve; });
  };
  const view = render(shell(cache, "A", "type=dashboard"));
  await waitFor(() => assert.ok(view.getByText("Count 1")));
  now += 45_001;
  await act(async () => cache.set("image:clock", "tick", 1000));
  await waitFor(() => assert.equal(calls, 2));
  assert.ok(view.getByText("Count 1"));
  assert.equal(view.queryByText("Loading"), null);
  await act(async () => complete(Response.json({ owner: "A", data: { count: 2 } })));
  await waitFor(() => assert.ok(view.getByText("Count 2")));
  view.unmount(); cache.dispose();
});

test("image views reuse the same signed URL across fresh page props and stop reusing after deletion", async () => {
  const cache = new MemoryCache();
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const first = `https://example.supabase.co/storage/v1/object/sign/card-images/A/card/original.png?token=header.${payload}.first`;
  const second = first.replace(".first", ".second");
  function ImageView({ url }: { url: string }) { return createElement("img", { alt: "Card", src: useReusableImageUrl(url) ?? undefined }); }
  const image = (url: string) => createElement(WorkspaceDataBoundary, { cache, owner: "A" }, createElement(ImageView, { url }));
  const view = render(image(first));
  await waitFor(() => assert.equal(cache.get("image:A:A/card/original.png"), first));
  view.rerender(image(second));
  assert.equal(view.getByRole("img").getAttribute("src"), first);
  await act(async () => cache.invalidate(true));
  assert.equal(view.getByRole("img").getAttribute("src"), second);
  view.unmount(); cache.dispose();
});
