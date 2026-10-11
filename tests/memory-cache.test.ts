import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryCache, reuseImageUrl } from "../lib/cache/memory-cache";

test("memory cache deduplicates requests, separates keys and expires without extending lifetime on reads", async () => {
  let now = 1000, calls = 0;
  const cache = new MemoryCache(() => now);
  let complete: (value: unknown) => void = () => {};
  const first = cache.load("A:cards?sort=newest", 45_000, () => { calls++; return new Promise(resolve => { complete = resolve; }); });
  const second = cache.load("A:cards?sort=newest", 45_000, async () => { assert.fail("Duplicate fetch"); });
  assert.equal(first, second);
  await Promise.resolve();
  complete({ cards: ["A"] }); await first;
  assert.equal(calls, 1);
  assert.deepEqual(cache.get("A:cards?sort=newest"), { cards: ["A"] });
  assert.equal(cache.get("B:cards?sort=newest"), undefined);
  assert.equal(cache.get("A:cards?sort=oldest"), undefined);
  now += 44_999; assert.ok(cache.get("A:cards?sort=newest"));
  now++; assert.equal(cache.get("A:cards?sort=newest"), undefined);
  assert.equal(cache.snapshot("A:cards?sort=newest").status, "stale");
  const refresh = cache.load("A:cards?sort=newest", 45_000, async () => ({ cards: ["updated"] }));
  assert.deepEqual(cache.snapshot("A:cards?sort=newest").value, { cards: ["A"] });
  await refresh;
  assert.deepEqual(cache.get("A:cards?sort=newest"), { cards: ["updated"] });
  cache.dispose();
});

test("mutation/session invalidation fences pending responses; deleted images and account data cannot repopulate", async () => {
  const cache = new MemoryCache();
  let complete: (value: string) => void = () => {};
  const first = cache.load("A:detail", 30_000, () => new Promise<string>(resolve => { complete = resolve; }));
  await Promise.resolve();
  cache.set("image:A:path", "signed", 270_000);
  cache.invalidate();
  assert.equal(cache.get("image:A:path"), "signed");
  await cache.load("A:detail", 30_000, async () => "edited");
  complete("stale"); await first;
  assert.equal(cache.get("A:detail"), "edited");
  cache.block();
  assert.equal(cache.get("image:A:path"), undefined);
  await cache.load("B:detail", 30_000, async () => assert.fail("Blocked session must not fetch"));
  assert.equal(cache.snapshot("A:detail"), cache.snapshot("A:detail"));
  cache.unblock();
  await cache.load("B:detail", 30_000, async () => "B");
  assert.equal(cache.get("A:detail"), undefined);
  assert.equal(cache.get("B:detail"), "B");
  cache.dispose();
});

test("failures use controlled messages, retry after invalidation, and bounded entries evict older data", async () => {
  const cache = new MemoryCache(Date.now, 2);
  await cache.load("failed", 45_000, async () => { throw new Error("Secret diagnostics"); });
  assert.equal(cache.snapshot("failed").status, "error");
  assert.ok(!cache.snapshot("failed").error?.includes("Secret"));
  cache.invalidate();
  await cache.load("failed", 45_000, async () => "recovered");
  cache.set("two", 2, 45_000); cache.set("three", 3, 45_000);
  assert.equal(cache.get("failed"), undefined);
  assert.equal(cache.get("three"), 3);
  cache.dispose();
});

test("image links are reused by owned path and renewed before the data-cache lifetime reaches the expiry margin", () => {
  let now = Date.now();
  const cache = new MemoryCache(() => now);
  const first = "https://example.supabase.co/storage/v1/object/sign/card-images/A/card/original.png?token=first";
  const second = first.replace("first", "second");
  const expiry = Date.now() + 300_000;
  assert.equal(reuseImageUrl(cache, "A", first, expiry, 45_000), first);
  assert.equal(reuseImageUrl(cache, "A", second, expiry, 45_000), first);
  assert.equal(reuseImageUrl(cache, "B", second, expiry, 45_000), second);
  const malformed = "https://example.supabase.co/storage/v1/object/sign/card-images/%E0%A4%A";
  assert.equal(reuseImageUrl(cache, "A", malformed, expiry), malformed);
  now += 240_000;
  assert.equal(reuseImageUrl(cache, "A", second, expiry, 45_000), second);
  cache.invalidate(true);
  assert.equal(cache.get("image:A:A/card/original.png"), undefined);
  cache.dispose();
});
