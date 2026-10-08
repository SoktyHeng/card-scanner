import assert from "node:assert/strict";
import { test } from "node:test";
import { createExtractionLimit } from "../../lib/ai/extraction-limit";
import { awaitExtraction } from "../../lib/ai/abortable";

test("extraction limiter isolates accounts, blocks parallel requests, resets windows and bounds memory", () => {
  let time = 0;
  const acquire = createExtractionLimit(() => time, 2);
  const release = acquire("A");
  assert.throws(() => acquire("A"), { code: "REQUEST_RATE_LIMITED" });
  acquire("B")();
  assert.throws(() => acquire("C"), { code: "REQUEST_RATE_LIMITED" });
  release(); release();
  for (let attempt = 1; attempt < 6; attempt++) acquire("A")();
  assert.throws(() => acquire("A"), { code: "REQUEST_RATE_LIMITED" });
  time = 60000;
  acquire("A")(); acquire("C")();
});

test("extraction deadline rejects non-cooperating providers and handles late rejection safely", async () => {
  const controller = new AbortController();
  let fail!: (error: Error) => void;
  const pending = awaitExtraction(controller.signal, () => new Promise<never>((_, reject) => { fail = reject; }));
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { code: "EXTRACTION_TIMEOUT" });
  fail(new Error("private provider failure"));
  let called = false;
  await assert.rejects(awaitExtraction(AbortSignal.abort(), async () => { called = true; }), { code: "EXTRACTION_TIMEOUT" });
  assert.equal(called, false);
  assert.equal(await awaitExtraction(new AbortController().signal, async () => "completed"), "completed");
});
