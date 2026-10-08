import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { OpenAiCardExtractor } from "../../lib/ai/openai-card-extractor";
import { AzureFoundryCardExtractor } from "../../lib/ai/azure-foundry-card-extractor";
import { NvidiaCardExtractor } from "../../lib/ai/nvidia-card-extractor";
import { MoonshotCardExtractor } from "../../lib/ai/moonshot-card-extractor";
import { extractCard } from "../../lib/ai/card-extractor";
import { createExtractionHandler } from "../../lib/ai/extraction-handler";
import { createSaveCardHandler } from "../../lib/cards/save-handler";
import { saveReviewedCard, SaveError, type CardSaveStore, type CardImageInsert } from "../../lib/cards/save-service";
import { combineCardSides } from "../../lib/ai/card-sides";
import { createReviewDraft, validateReviewDraft } from "../../lib/cards/review";
import { businessCard, emptyCard } from "../fixtures/extraction";

const owner = "00000000-0000-4000-8000-000000000001";
const submissionId = "00000000-0000-4000-8000-000000000003";
async function fixtureImages() {
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  return { bytes: new Uint8Array(bytes), mimeType: "image/png" as const };
}
function payload() {
  const aiExtraction = combineCardSides({ front: businessCard(), back: emptyCard() });
  const review = validateReviewDraft(createReviewDraft(aiExtraction));
  assert.ok(review.success);
  return { submissionId, reviewConfirmed: true as const, aiExtraction, reviewedData: review.data };
}
test("each provider sends both labeled images in one request and the service validates separate side output", async () => {
  const image = await fixtureImages();
  const sides = { front: businessCard(), back: emptyCard() };
  for (const name of ["openai", "azure", "nvidia", "moonshot"] as const) {
    let calls = 0;
    const request: typeof fetch = async (_input, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      const content = body.input?.[1].content ?? body.messages[1].content;
      assert.equal(content.filter((item: { type: string }) => item.type === "input_image" || item.type === "image_url").length, 2);
      assert.match(content[0].text, /Front/); assert.match(content[2].text, /Back/);
      return name === "openai" || name === "azure"
        ? Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(sides) }] }] })
        : Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(sides) } }] });
    };
    const config = { apiKey: "test-key", model: "test-model" };
    const provider = name === "openai" ? new OpenAiCardExtractor(config, request)
      : name === "azure" ? new AzureFoundryCardExtractor({ ...config, endpoint: "https://example.com/v1/responses" }, request)
      : name === "nvidia" ? new NvidiaCardExtractor(config, request) : new MoonshotCardExtractor(config, request);
    const result = await extractCard(image, new AbortController().signal, provider, image);
    assert.equal(calls, 1); assert.deepEqual(result.sourceSides, sides);
  }
  await assert.rejects(extractCard(image, new AbortController().signal, { extract: async () => businessCard() }, image), /Unable to extract/);
});
test("extraction validates both images before invoking AI; back-only, duplicates and corrupt back uploads fail", async () => {
  const image = await fixtureImages();
  let calls = 0;
  const handler = createExtractionHandler({ authenticate: async () => true, extract: async (front, _signal, back) => {
    calls++; assert.deepEqual(Array.from(front.bytes), Array.from(image.bytes)); assert.deepEqual(Array.from(back?.bytes ?? []), Array.from(image.bytes)); return payload().aiExtraction;
  } });
  const file = () => new File([image.bytes], "card.png");
  const request = (form: FormData) => new Request("http://localhost/api/cards/extract", { method: "POST", body: form });
  const good = new FormData(); good.append("image", file()); good.append("backImage", file());
  assert.equal((await handler(request(good))).status, 200);
  for (const mode of ["missing-front", "duplicate-back", "corrupt-back"]) {
    const form = new FormData(); if (mode !== "missing-front") form.append("image", file());
    form.append("backImage", mode === "corrupt-back" ? new File(["invalid"], "card.png") : file());
    if (mode === "duplicate-back") form.append("backImage", file());
    assert.equal((await handler(request(form))).status, mode === "corrupt-back" ? 422 : 400);
  }
  assert.equal(calls, 1);
});
test("two images save with atomic metadata, and failed second upload or database insert cleans new uploads", async () => {
  const image = await fixtureImages();
  for (const failure of ["none", "back-upload", "insert", "cleanup"] as const) {
    const images = new Set<string>(); let inserted: CardImageInsert[] = []; let inserts = 0;
    const store: CardSaveStore = {
      findCard: async () => null, findDuplicates: async () => [],
      upload: async path => { if (failure === "back-upload" && path.endsWith("/back.png")) throw new SaveError("UPLOAD_FAILED"); images.add(path); return "uploaded"; },
      insert: async (_card, metadata) => { inserts++; if (failure === "insert" || failure === "cleanup") throw new Error("database failure"); inserted = metadata; },
      remove: async path => failure === "cleanup" ? false : images.delete(path),
    };
    const context = { userId: owner, store };
    if (failure === "none") {
      const id = await saveReviewedCard(context, payload(), image, image);
      assert.equal(images.size, 2); assert.equal(inserted.length, 2);
      assert.deepEqual(inserted.map(row => row.side), ["front", "back"]);
      assert.ok(inserted.every(row => row.storage_path.startsWith(`${owner}/${id}/`)));
    } else {
      await assert.rejects(saveReviewedCard(context, payload(), image, image), error => error instanceof SaveError && error.code === (failure === "back-upload" ? "UPLOAD_FAILED" : failure === "cleanup" ? "CLEANUP_FAILED" : "INSERT_FAILED"));
      assert.equal(images.size, failure === "cleanup" ? 2 : 0);
      assert.equal(inserts, failure === "back-upload" ? 0 : 1);
    }
  }
});
test("save rejects absent sessions and mismatched back/source data before uploading", async () => {
  const image = await fixtureImages();
  let uploads = 0;
  const store: CardSaveStore = { findCard: async () => null, findDuplicates: async () => [], upload: async () => { uploads++; return "uploaded"; }, insert: async () => {}, remove: async () => true };
  const form = new FormData(); form.append("image", new File([image.bytes], "front.png")); form.append("data", JSON.stringify(payload()));
  const request = () => new Request("http://localhost/api/cards", { method: "POST", body: form });
  assert.equal((await createSaveCardHandler(async () => null)(request())).status, 401);
  assert.equal((await createSaveCardHandler(async () => ({ userId: owner, store }))(request())).status, 422);
  assert.equal(uploads, 0);
});
