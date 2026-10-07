import assert from "node:assert/strict";
import { before, test } from "node:test";
import sharp from "sharp";
import { createSaveCardHandler } from "../../lib/cards/save-handler";
import { saveMessages } from "../../lib/cards/save-schema";
import { SaveError, saveReviewedCard, submissionCardId, type CardInsert, type CardSaveStore } from "../../lib/cards/save-service";
import { createReviewDraft, editStandardField, validateReviewDraft } from "../../lib/cards/review";
import { businessCard } from "../fixtures/extraction";

const userId = "00000000-0000-4000-8000-000000000001";
const submissionId = "00000000-0000-4000-8000-000000000003";
let png: Buffer;
before(async () => { png = await sharp({ create: { width: 80, height: 50, channels: 3, background: "white" } }).png().toBuffer(); });
function payload() {
  const aiExtraction = businessCard();
  const reviewed = validateReviewDraft(editStandardField(createReviewDraft(aiExtraction), "name", "Corrected name"));
  assert.ok(reviewed.success);
  reviewed.data.extraFields.push({ label: "Tier", key: "tier", value: "Gold", confidence: null });
  return { submissionId, reviewConfirmed: true as const, aiExtraction, reviewedData: reviewed.data };
}
function request(data: unknown = payload(), image: File = new File([new Uint8Array(png)], "spoofed.pdf", { type: "text/plain" })) {
  const form = new FormData();
  form.append("image", image);
  form.append("data", JSON.stringify(data));
  return new Request("http://localhost:3000/api/cards", { method: "POST", body: form });
}
function fixture() {
  const records = new Map<string, CardInsert>();
  const images = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const store: CardSaveStore = {
    async findCard(id) { calls.push("find"); return records.has(id) ? { id } : null; },
    async upload(path, image) { calls.push("upload"); if (images.has(path)) return "exists"; images.set(path, image.bytes); return "uploaded"; },
    async insert(card) { calls.push("insert"); records.set(card.id!, card); },
    async remove(path) { calls.push("remove"); return images.delete(path); },
  };
  return { store, records, images, calls };
}

test("save authenticates before reading uploads, denies foreign origins and controls auth failures", async () => {
  const denied = createSaveCardHandler(async () => null);
  const response = await denied(request());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const failed = await createSaveCardHandler(async () => { throw new Error("private-secret"); })(request());
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.code, "AUTH_UNAVAILABLE");
  let authenticated = false;
  const foreign = request();
  foreign.headers.set("origin", "https://attacker.example");
  assert.equal((await createSaveCardHandler(async () => { authenticated = true; return null; })(foreign)).status, 403);
  assert.equal(authenticated, false);
});

test("save validates explicit review, UUID, AI and corrected schemas before any upload", async () => {
  const { store, calls } = fixture();
  const handler = createSaveCardHandler(async () => ({ userId, store }));
  for (const input of [
    { ...payload(), reviewConfirmed: false },
    { ...payload(), submissionId: "invalid" },
    { ...payload(), user_id: "forged-owner" },
    { ...payload(), aiExtraction: {} },
    { ...payload(), reviewedData: { ...payload().reviewedData, extraFields: {} } },
    { ...payload(), reviewedData: { ...payload().reviewedData, email: "invalid" } },
  ]) {
    const response = await handler(request(input));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "INVALID_SAVE");
  }
  assert.deepEqual(calls, []);
  for (const image of [new File(["not an image"], "fake.png"), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png")]) {
    const response = await handler(request(payload(), image));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, "INVALID_IMAGE");
  }
  const duplicate = new FormData();
  duplicate.append("image", new File([new Uint8Array(png)], "a.png"));
  duplicate.append("image", new File([new Uint8Array(png)], "b.png"));
  duplicate.append("data", JSON.stringify(payload()));
  assert.equal((await handler(new Request("http://localhost:3000/api/cards", { method: "POST", body: duplicate }))).status, 422);
  assert.deepEqual(calls, []);
});

test("successful save uploads original bytes before inserting owner-scoped final columns and source data", async () => {
  const { store, records, images, calls } = fixture();
  const handler = createSaveCardHandler(async () => ({ userId, store }));
  const response = await handler(request());
  assert.equal(response.status, 201);
  const result = await response.json();
  const id = submissionCardId(userId, submissionId);
  assert.equal(result.id, id);
  assert.deepEqual(calls, ["find", "upload", "insert"]);
  const record = records.get(id)!;
  assert.equal(record.user_id, userId);
  assert.equal(record.name, "Corrected name");
  assert.deepEqual(record.ai_extraction, businessCard());
  assert.equal(record.raw_ocr_text, businessCard().rawText);
  assert.deepEqual(record.extra_fields, payload().reviewedData.extraFields);
  assert.ok(Array.isArray(record.extra_fields));
  assert.equal(record.original_image_path, `${userId}/${id}/original.png`);
  assert.deepEqual(images.get(record.original_image_path!)!, png);
  assert.equal((await handler(request())).status, 201);
  assert.equal(records.size, 1);
  assert.equal(calls.filter(call => call === "upload").length, 1);
  assert.notEqual(submissionCardId("00000000-0000-4000-8000-000000000002", submissionId), id);
});

test("storage failure never inserts; insertion failure removes the uploaded original", async () => {
  const failedUpload = fixture();
  failedUpload.store.upload = async () => { throw new SaveError("UPLOAD_FAILED"); };
  const response = await createSaveCardHandler(async () => ({ userId, store: failedUpload.store }))(request());
  assert.equal((await response.json()).error.code, "UPLOAD_FAILED");
  assert.equal(failedUpload.records.size, 0);
  const failedInsert = fixture();
  failedInsert.store.insert = async () => { throw new Error("sensitive-database-details"); };
  const failed = await createSaveCardHandler(async () => ({ userId, store: failedInsert.store }))(request());
  const json = await failed.json();
  assert.equal(json.error.code, "INSERT_FAILED");
  assert.equal(json.error.message, saveMessages.INSERT_FAILED);
  assert.equal(JSON.stringify(json).includes("sensitive"), false);
  assert.equal(failedInsert.images.size, 0);
  assert.equal(failedInsert.calls.at(-1), "remove");
});

test("cleanup failure is explicit; ambiguous committed inserts retain their image and are safe to retry", async () => {
  const failedCleanup = fixture();
  failedCleanup.store.insert = async () => { throw new Error("insert failed"); };
  failedCleanup.store.remove = async () => false;
  const response = await createSaveCardHandler(async () => ({ userId, store: failedCleanup.store }))(request());
  assert.equal((await response.json()).error.code, "CLEANUP_FAILED");
  assert.equal(failedCleanup.images.size, 1);
  const committed = fixture();
  const insert = committed.store.insert;
  committed.store.insert = async card => { await insert(card); throw new Error("response lost after commit"); };
  const saved = await createSaveCardHandler(async () => ({ userId, store: committed.store }))(request());
  assert.equal(saved.status, 201);
  assert.equal(committed.images.size, 1);
  assert.equal(committed.records.size, 1);
  assert.equal(committed.calls.includes("remove"), false);
});

test("unknown insert outcome does not delete an image; an in-flight duplicate cannot overwrite it", async () => {
  const unknown = fixture();
  let reads = 0;
  unknown.store.findCard = async () => { if (++reads > 1) throw new SaveError("SAVE_STATUS_UNKNOWN"); return null; };
  unknown.store.insert = async () => { throw new Error("connection lost"); };
  const result = await createSaveCardHandler(async () => ({ userId, store: unknown.store }))(request());
  assert.equal((await result.json()).error.code, "SAVE_STATUS_UNKNOWN");
  assert.equal(unknown.images.size, 1);
  assert.equal(unknown.calls.includes("remove"), false);
  const concurrent = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const upload = concurrent.store.upload;
  concurrent.store.upload = async (path, image) => { started(); await gate; return upload(path, image); };
  const image = { bytes: png, mimeType: "image/png" as const };
  const pending = saveReviewedCard({ userId, store: concurrent.store }, payload(), image);
  await entered;
  await assert.rejects(saveReviewedCard({ userId, store: concurrent.store }, payload(), image), { code: "SAVE_IN_PROGRESS" });
  release();
  await pending;
  assert.equal(concurrent.records.size, 1);
});

test("retry can finish an earlier upload whose response was lost without replacing the original", async () => {
  const state = fixture();
  const id = submissionCardId(userId, submissionId);
  const path = `${userId}/${id}/original.png`;
  state.images.set(path, png);
  const result = await createSaveCardHandler(async () => ({ userId, store: state.store }))(request());
  assert.equal(result.status, 201);
  assert.equal(state.records.size, 1);
  assert.deepEqual(state.images.get(path), png);
  assert.equal(state.calls.includes("remove"), false);
});
