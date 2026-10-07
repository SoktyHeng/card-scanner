import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cardOutputSchema,
  extractedCardSchema,
  extractionResponseSchema,
  standardFields,
} from "../lib/ai/card-schema";
import { emptyCard, businessCard } from "./fixtures/extraction";

test("extraction schema requires explicit nulls, strict structure, arrays and bounded confidence", () => {
  assert.deepEqual(extractedCardSchema.parse(emptyCard()), emptyCard());
  assert.deepEqual(extractedCardSchema.parse(businessCard()), businessCard());
  for (const invalid of [
    { ...emptyCard(), name: undefined },
    { ...emptyCard(), extraFields: { employee_code: "EMP-1" } },
    { ...emptyCard(), overallConfidence: 1.1 },
    { ...emptyCard(), overallConfidence: -0.01 },
    { ...emptyCard(), invented: "unexpected" },
    {
      ...emptyCard(),
      name: "",
      fieldConfidences: { ...emptyCard().fieldConfidences, name: 0.8 },
    },
    {
      ...emptyCard(),
      name: "  ",
      fieldConfidences: { ...emptyCard().fieldConfidences, name: 0.8 },
    },
    {
      ...emptyCard(),
      fieldConfidences: { ...emptyCard().fieldConfidences, name: 0.8 },
    },
    {
      ...businessCard(),
      fieldConfidences: { ...businessCard().fieldConfidences, name: null },
    },
  ])
    assert.equal(extractedCardSchema.safeParse(invalid).success, false);
  const jsonSchema = cardOutputSchema.toJSONSchema();
  assert.equal(jsonSchema.additionalProperties, false);
  for (const field of [
    ...standardFields,
    "extraFields",
    "rawText",
    "fieldConfidences",
  ])
    assert.ok(jsonSchema.required?.includes(field));
});

test("extra fields preserve visible labels/values and unclear values require low confidence", () => {
  const extras = [
    {
      label: "Employee Code",
      key: "employee_code",
      value: "EMP-00123",
      confidence: 0.97,
    },
    {
      label: "Valid Until",
      key: "valid_until",
      value: "31/12/2027",
      confidence: 0.91,
    },
    { label: null, key: "unknown_field", value: "ABC-7788", confidence: 0.35 },
    { label: null, key: "unknown_field", value: "DEF-9988", confidence: 0.2 },
  ];
  assert.deepEqual(
    extractedCardSchema.parse({ ...emptyCard(), extraFields: extras })
      .extraFields,
    extras,
  );
  for (const invalid of [
    { ...extras[0], key: "Employee Code" },
    { ...extras[0], confidence: 2 },
    { ...extras[0], value: "   " },
    { ...extras[0], verified: true },
    { ...extras[2], confidence: 0.9 },
    { ...extras[2], label: "Guessed label" },
    { ...extras[2], key: "guessed_label" },
  ])
    assert.equal(
      extractedCardSchema.safeParse({ ...emptyCard(), extraFields: [invalid] })
        .success,
      false,
    );
});

test("API response validation rejects malformed successes and unknown errors", () => {
  assert.equal(
    extractionResponseSchema.safeParse({ success: true, data: businessCard() })
      .success,
    true,
  );
  assert.equal(
    extractionResponseSchema.safeParse({ success: true, data: {} }).success,
    false,
  );
  assert.equal(
    extractionResponseSchema.safeParse({
      success: false,
      error: { code: "EXTRACTION_FAILED", message: "Safe message" },
    }).success,
    true,
  );
  assert.equal(
    extractionResponseSchema.safeParse({
      success: false,
      error: { code: "SECRET", message: "Unsafe message" },
    }).success,
    false,
  );
});
