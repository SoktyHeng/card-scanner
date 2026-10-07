import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addExtraField, convertExtraField, createReviewDraft, editExtraField, editStandardField,
  prepareReviewedScan, removeExtraField, reviewedCardSchema, validateReviewDraft,
} from "../lib/cards/review";
import { businessCard, emptyCard } from "./fixtures/extraction";
import { createSubmissionId, saveCardSchema } from "../lib/cards/save-schema";

test("submission UUIDs use getRandomValues and validate without requiring secure-context randomUUID", () => {
  const first = createSubmissionId(), second = createSubmissionId();
  assert.notEqual(first, second);
  assert.equal(saveCardSchema.shape.submissionId.safeParse(first).success, true);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("review validates blank/missing values, Khmer, email and limits independently of AI rules", () => {
  let draft = createReviewDraft(emptyCard());
  assert.equal(validateReviewDraft(draft).success, true);
  draft = editStandardField(draft, "name", "សុខា");
  draft = editStandardField(draft, "phone", " +855 12 345 678 ");
  draft = editStandardField(draft, "company", "   ");
  const card = validateReviewDraft(draft);
  assert.ok(card.success);
  assert.equal(card.data.name, "សុខា");
  assert.equal(card.data.phone, "+855 12 345 678");
  assert.equal(card.data.company, null);
  assert.equal(card.data.fieldConfidences.name, null);
  assert.equal(validateReviewDraft(editStandardField(draft, "email", "wrong email")).success, false);
  assert.equal(validateReviewDraft(editStandardField(draft, "email", "user@example.com")).success, true);
  assert.equal(validateReviewDraft(editStandardField(draft, "name", "x".repeat(2001))).success, false);
  assert.equal(reviewedCardSchema.safeParse({ ...card.data, rawText: "overwrite" }).success, false);
  assert.equal(reviewedCardSchema.safeParse({ ...card.data, fieldConfidences: { ...card.data.fieldConfidences, name: 2 } }).success, false);
});

test("custom editing/addition/removal is immutable; manual values never receive fabricated confidence", () => {
  const source = businessCard();
  const snapshot = structuredClone(source);
  const initial = createReviewDraft(source);
  let draft = editExtraField(initial, "ai-0", { label: "Employee ID", value: "EMP-2" });
  assert.equal(draft.extraFields[0].key, "employee_id");
  assert.equal(draft.extraFields[0].confidence, null);
  draft = addExtraField(draft, "manual-0");
  assert.equal(validateReviewDraft(draft).success, false, "Empty extra value must be corrected or removed");
  draft = editExtraField(draft, "manual-0", { label: "កម្រិត", value: "Gold" });
  assert.equal(draft.extraFields[1].key, "custom_field");
  draft = addExtraField(draft, "manual-1");
  draft = editExtraField(draft, "manual-1", { label: "Employee ID", value: "EMP-3" });
  assert.equal(draft.extraFields[2].key, "employee_id_2");
  assert.ok(validateReviewDraft(draft).success);
  draft = removeExtraField(draft, "ai-0");
  assert.equal(draft.extraFields.length, 2);
  assert.equal(initial.extraFields[0].value, "EMP-1001");
  assert.deepEqual(source, snapshot);
});

test("conversion refuses an occupied target without changing either value and transfers empty targets", () => {
  const original = createReviewDraft(businessCard());
  const collision = convertExtraField(original, "ai-0", "name");
  assert.match(collision.error!, /already has a value/);
  assert.equal(collision.draft, original);
  assert.equal(collision.draft.fields.name, "JOHN SMITH");
  assert.equal(collision.draft.extraFields[0].value, "EMP-1001");
  const converted = convertExtraField(original, "ai-0", "cardNumber");
  assert.equal(converted.error, undefined);
  assert.equal(converted.draft.fields.cardNumber, "EMP-1001");
  assert.equal(converted.draft.fieldConfidences.cardNumber, 0.98);
  assert.equal(converted.draft.extraFields.length, 0);
  const edited = convertExtraField(editExtraField(original, "ai-0", { value: "Manual" }), "ai-0", "cardNumber");
  assert.equal(edited.draft.fieldConfidences.cardNumber, null);
  assert.ok(validateReviewDraft(edited.draft).success);
  assert.ok(convertExtraField(original, "missing", "name").error);
  assert.ok(convertExtraField(editExtraField(original, "ai-0", { value: " " }), "ai-0", "cardNumber").error);
});

test("unknown and low confidence fields can be confirmed; source and corrected data stay separate", () => {
  const source = emptyCard();
  source.extraFields = [{ label: null, key: "unknown_field", value: "ABC-7788", confidence: 0.35 }];
  const draft = createReviewDraft(source);
  const result = validateReviewDraft(draft);
  assert.ok(result.success);
  assert.equal(result.data.extraFields[0].label, null);
  assert.equal(result.data.extraFields[0].confidence, 0.35);
  const image = new File(["original"], "card.png");
  const bundle = prepareReviewedScan(image, source, result.data);
  assert.equal(bundle.originalImage, image);
  assert.equal(bundle.rawText, null);
  assert.deepEqual(bundle.aiExtraction, source);
  bundle.reviewedData.extraFields[0].value = "Corrected";
  assert.equal(source.extraFields[0].value, "ABC-7788");
  assert.equal(bundle.aiExtraction.extraFields[0].value, "ABC-7788");
});
