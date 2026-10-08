import assert from "node:assert/strict";
import { test } from "node:test";
import { combineCardSides } from "../lib/ai/card-sides";
import { businessCard, emptyCard } from "./fixtures/extraction";
import { createReviewDraft, validateReviewDraft } from "../lib/cards/review";

test("two sides combine missing fields and preserve exact source data without overwriting conflicts", () => {
  const front = businessCard(), back = emptyCard();
  back.name = "Different name"; back.fieldConfidences.name = 0.8;
  back.email = "back@example.com"; back.fieldConfidences.email = 0.95;
  back.rawText = "Different name\nback@example.com"; back.overallConfidence = 0.8;
  back.extraFields = [{ label: "Employee Code", key: "employee_code", value: "OTHER-100", confidence: 0.7 }];
  const snapshot = structuredClone({ front, back });
  const result = combineCardSides({ front, back });
  assert.equal(result.name, null);
  assert.equal(result.fieldConfidences.name, null);
  assert.equal(result.email, back.email);
  assert.deepEqual(result.conflictingFields, ["name"]);
  assert.equal(result.hasSideConflicts, true);
  assert.ok(result.extraFields.some(field => field.label === "Name (front)" && field.value === front.name));
  assert.ok(result.extraFields.some(field => field.label === "Name (back)" && field.value === back.name));
  assert.deepEqual(result.sourceSides, snapshot);
  assert.deepEqual({ front, back }, snapshot);
  assert.match(result.rawText!, /Front:\n.*[\s\S]*Back:/);
  assert.equal(validateReviewDraft(createReviewDraft(result)).success, true);
});
test("equal fields, empty sides and unknown fields retain values and supplied confidence", () => {
  assert.equal(combineCardSides({ front: emptyCard(), back: emptyCard() }).overallConfidence, 0);
  const front = businessCard(), back = businessCard();
  back.extraFields.push({ label: null, key: "unknown_field", value: "ABC-7788", confidence: 0.35 });
  const result = combineCardSides({ front, back });
  assert.equal(result.name, front.name);
  assert.deepEqual(result.conflictingFields, []);
  assert.ok(result.extraFields.some(field => field.key === "unknown_field" && field.label === null && field.confidence === 0.35));
});
