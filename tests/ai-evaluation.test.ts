import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluationManifestSchema, evaluateCard } from "../scripts/ai-evaluation";
import { standardFields } from "../lib/ai/card-schema";
import { businessCard } from "./fixtures/extraction";

function fixture() {
  const card = businessCard();
  return {
    permittedForAiProcessing: true,
    cases: [{ id: "business-01", image: "photo.jpg", capture: "physical-photo", cardType: "business", languages: ["en"], conditions: ["clear"], expected: {
      fields: Object.fromEntries(standardFields.map(key => [key, card[key]])),
      extraFields: card.extraFields.map(({ label, key, value }) => ({ label, key, value })),
    } }],
  };
}

test("evaluation requires permission, complete ground truth, unique safe IDs and bounded cases", () => {
  assert.ok(evaluationManifestSchema.safeParse(fixture()).success);
  const manifest = fixture();
  assert.equal(evaluationManifestSchema.safeParse({ ...manifest, permittedForAiProcessing: false }).success, false);
  assert.equal(evaluationManifestSchema.safeParse({ ...manifest, cases: [...manifest.cases, ...manifest.cases] }).success, false);
  delete manifest.cases[0].expected.fields.phone;
  assert.equal(evaluationManifestSchema.safeParse(manifest).success, false);
  assert.equal(evaluationManifestSchema.safeParse({ ...fixture(), cases: [] }).success, false);
});

test("evaluation detects missing, incorrect, invented and repeated custom values without logging contents", () => {
  const expected = evaluationManifestSchema.parse(fixture()).cases[0].expected;
  assert.ok(evaluateCard(expected, businessCard()).passed);
  const card = businessCard();
  card.name = null;
  card.company = "PRIVATE WRONG COMPANY";
  expected.fields.website = null;
  card.website = "PRIVATE INVENTED WEBSITE";
  card.extraFields.push({ label: null, key: "unknown_field", value: "PRIVATE CODE", confidence: 0.2 });
  const result = evaluateCard(expected, card);
  assert.equal(result.passed, false);
  assert.ok(result.missing.includes("name"));
  assert.ok(result.incorrect.includes("company"));
  assert.ok(result.invented.includes("website"));
  assert.ok(result.invented.includes("extraField"));
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  const extra = { label: "Tier", key: "tier", value: "Gold", confidence: 0.9 };
  expected.extraFields = [{ label: "Tier", key: "tier", value: "Gold" }];
  const repeated = evaluateCard(expected, { ...businessCard(), extraFields: [extra, extra] });
  assert.deepEqual(repeated.invented, ["extraField"]);
});

test("evaluation preserves Khmer and exact values while tolerating NFC, whitespace and email casing", () => {
  const expected = evaluationManifestSchema.parse(fixture()).cases[0].expected;
  const card = businessCard();
  expected.fields.name = "សុខា";
  card.name = " សុខា ";
  expected.fields.email = "john@example.com";
  card.email = "JOHN@EXAMPLE.COM";
  assert.ok(evaluateCard(expected, card).passed);
  card.phone = "+855 00 000 000";
  assert.deepEqual(evaluateCard(expected, card).incorrect, ["phone"]);
});
