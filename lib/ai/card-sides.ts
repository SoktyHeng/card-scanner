import { extractedCardSchema, singleSideCardSchema, standardFields, type twoSideCardSchema } from "./card-schema";
import type { z } from "zod";
import { fieldLabels } from "@/lib/cards/review";
import type { ExtractedCard } from "./types";

// Exact agreement only: preserve formatting and never choose between conflicts.
export function combineCardSides(sides: z.infer<typeof twoSideCardSchema>): ExtractedCard {
  const front = singleSideCardSchema.parse(sides.front);
  const back = singleSideCardSchema.parse(sides.back);
  const merged = structuredClone(front);
  const conflictingFields: (typeof standardFields)[number][] = [];
  merged.extraFields = (["front", "back"] as const).flatMap(side => sides[side].extraFields.map(field => ({ ...field, label: field.label === null ? null : `${field.label} (${side})` })));
  for (const field of standardFields) {
    if (front[field] !== null && back[field] !== null && front[field] !== back[field]) {
      conflictingFields.push(field);
      merged[field] = null;
      merged.fieldConfidences[field] = null;
      for (const side of ["front", "back"] as const) {
        const source = sides[side];
        merged.extraFields.push({ label: `${fieldLabels[field]} (${side})`,
          key: `${side}_${field.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`)}`,
          value: source[field]!, confidence: source.fieldConfidences[field]! });
      }
    } else if (front[field] === null && back[field] !== null) {
      merged[field] = back[field];
      merged.fieldConfidences[field] = back.fieldConfidences[field];
    }
  }
  // Retain supplied scores rather than fabricating an average for the combined card.
  merged.overallConfidence = Math.min(front.overallConfidence, back.overallConfidence);
  merged.rawText = [front.rawText && `Front:\n${front.rawText}`, back.rawText && `Back:\n${back.rawText}`].filter(Boolean).join("\n\n") || null;
  const hasSideConflicts = conflictingFields.length > 0 || front.extraFields.some(a => back.extraFields.some(b => a.key === b.key && a.value !== b.value));
  return extractedCardSchema.parse({ ...merged, sourceSides: { front, back }, conflictingFields, hasSideConflicts });
}
