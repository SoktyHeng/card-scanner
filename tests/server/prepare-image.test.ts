import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { MAX_AI_IMAGE_EDGE, MAX_AI_ORIGINAL_BYTES, prepareExtractionImage } from "../../lib/ai/prepare-image";

test("small supported images remain unchanged for AI inference", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await sharp({ create: { width: 80, height: 50, channels: 3, background: "white" } })[format]().toBuffer();
    const image = { bytes, mimeType: `image/${format}` as "image/png" | "image/jpeg" | "image/webp" };
    assert.equal(await prepareExtractionImage(image), image);
  }
});

test("large camera photos get a bounded working copy without mutating the original", async () => {
  const bytes = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  const original = Buffer.from(bytes);
  const prepared = await prepareExtractionImage({ bytes, mimeType: "image/png" });
  const metadata = await sharp(prepared.bytes).metadata();
  assert.equal(prepared.mimeType, "image/jpeg");
  assert.equal(metadata.width, MAX_AI_IMAGE_EDGE);
  assert.equal(metadata.height, 1365);
  assert.deepEqual(bytes, original);
});

test("working copies respect EXIF orientation, strip metadata and do not upscale", async () => {
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: "white" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const prepared = await prepareExtractionImage({ bytes, mimeType: "image/jpeg" });
  const metadata = await sharp(prepared.bytes).metadata();
  assert.equal(metadata.width, 200);
  assert.equal(metadata.height, 300);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
});

test("large byte payloads within the dimension limit are recompressed without upscaling", async () => {
  const noise = new Uint8Array(1000 * 700 * 3);
  // Deterministic noise avoids a misleadingly tiny solid-color image fixture.
  let state = 12345;
  for (let index = 0; index < noise.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    noise[index] = state >>> 24;
  }
  const bytes = await sharp(noise, { raw: { width: 1000, height: 700, channels: 3 } }).png().toBuffer();
  assert.ok(bytes.length > MAX_AI_ORIGINAL_BYTES);
  const prepared = await prepareExtractionImage({ bytes, mimeType: "image/png" });
  const metadata = await sharp(prepared.bytes).metadata();
  assert.equal(metadata.width, 1000);
  assert.equal(metadata.height, 700);
  assert.ok(prepared.bytes.byteLength < bytes.byteLength);
});
