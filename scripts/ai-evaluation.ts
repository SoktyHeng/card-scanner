import { z } from "zod";
import { standardFields } from "../lib/ai/card-schema";
import type { ExtractedCard } from "../lib/ai/types";

const expectedExtra = z.strictObject({
  label: z.string().min(1).nullable(),
  key: z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/),
  value: z.string().min(1),
});
export const evaluationManifestSchema = z.strictObject({
  permittedForAiProcessing: z.literal(true),
  cases: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/),
    image: z.string().min(1),
    backImage: z.string().min(1).optional(),
    capture: z.enum(["physical-photo", "synthetic"]),
    cardType: z.enum(["business", "membership", "employee", "custom"]),
    languages: z.array(z.enum(["en", "km", "other"])).min(1),
    conditions: z.array(z.enum(["clear", "blur", "glare", "rotated", "small-text"])).min(1),
    expected: z.strictObject({
      fields: z.record(z.enum(standardFields), z.string().min(1).nullable()),
      extraFields: z.array(expectedExtra).max(100),
    }),
  })).min(1).max(100),
}).superRefine((manifest, context) => {
  if (new Set(manifest.cases.map(item => item.id)).size !== manifest.cases.length)
    context.addIssue({ code: "custom", path: ["cases"], message: "Case IDs must be unique." });
});
export type EvaluationCase = z.infer<typeof evaluationManifestSchema>["cases"][number];

function same(actual: string | null, expected: string | null, email = false) {
  const normalize = (value: string | null) => {
    const text = value?.normalize("NFC").trim() ?? null;
    return email ? text?.toLowerCase() ?? null : text;
  };
  return normalize(actual) === normalize(expected);
}

// Reports deliberately contain counts and field identifiers, never card values.
export function evaluateCard(expected: EvaluationCase["expected"], card: ExtractedCard) {
  const missing: string[] = [], incorrect: string[] = [], invented: string[] = [];
  let matched = 0;
  for (const key of standardFields) {
    const wanted = expected.fields[key], actual = card[key];
    if (same(actual, wanted, key === "email")) matched++;
    else if (wanted === null) invented.push(key);
    else if (actual === null) missing.push(key);
    else incorrect.push(key);
  }
  const remaining = [...card.extraFields];
  for (const field of expected.extraFields) {
    const index = remaining.findIndex(actual => actual.key === field.key && same(actual.label, field.label) && same(actual.value, field.value));
    if (index < 0) missing.push("extraField");
    else { matched++; remaining.splice(index, 1); }
  }
  invented.push(...remaining.map(() => "extraField"));
  return {
    passed: !missing.length && !incorrect.length && !invented.length,
    matched,
    expectedChecks: standardFields.length + expected.extraFields.length,
    missing,
    incorrect,
    invented,
    correctionsNeeded: missing.length + incorrect.length + invented.length,
  };
}
