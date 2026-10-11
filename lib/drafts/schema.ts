import { z } from "zod";
import { extractedCardSchema, standardFields } from "@/lib/ai/card-schema";
import { reviewedCardSchema, type StandardField } from "@/lib/cards/review";
import { duplicateAcknowledgementSchema } from "@/lib/cards/duplicates";

export const DRAFT_RETENTION_HOURS = 24;
export const DRAFT_BUCKET = "scan-drafts";
const uuid = z.uuid().transform(value => value.toLowerCase());
const text = z.string().max(2000);
const confidence = z.number().min(0).max(1).nullable();
const fields = Object.fromEntries(standardFields.map(key => [key, text])) as Record<StandardField, typeof text>;
const scores = Object.fromEntries(standardFields.map(key => [key, confidence])) as Record<StandardField, typeof confidence>;
// Recovery must preserve incomplete edits; final-card validation remains stricter.
export const recoverableReviewSchema = z.strictObject({
  fields: z.strictObject(fields), fieldConfidences: z.strictObject(scores),
  extraFields: z.array(z.strictObject({
    id: z.string().min(1).max(100), label: text, key: z.string().max(100), value: text, confidence,
  })).max(100),
}).refine(value => new Set(value.extraFields.map(field => field.id)).size === value.extraFields.length, "Duplicate field identifiers.");
export const draftPayloadSchema = z.strictObject({
  extraction: extractedCardSchema.nullable(),
  review: recoverableReviewSchema.nullable(),
  frontName: z.string().max(255).nullable(), backName: z.string().max(255).nullable(),
}).refine(value => !value.review || !!value.extraction, "Review requires source extraction.");
export type DraftPayload = z.infer<typeof draftPayloadSchema>;
export const draftWriteSchema = z.strictObject({
  id: uuid, expectedRevision: z.number().int().min(0).max(1000000), payload: draftPayloadSchema,
  frontMode: z.enum(["keep", "replace", "remove"]), backMode: z.enum(["keep", "replace", "remove"]),
});
export const draftRevisionSchema = z.strictObject({ expectedRevision: z.number().int().min(0).max(1000000) });
export const draftSaveSchema = draftRevisionSchema.extend({
  reviewConfirmed: z.literal(true), reviewedData: reviewedCardSchema,
  duplicateAcknowledgement: duplicateAcknowledgementSchema.optional(),
});
export type DraftMeta = { id: string; revision: number; expiresAt: string; updatedAt: string };
export const draftMetaSchema = z.object({ id: uuid, revision: z.number().int().min(0), expiresAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }) });
export const draftRestoreSchema = z.union([
  z.object({ savedCardId: uuid }),
  z.object({ meta: draftMetaSchema, payload: draftPayloadSchema, frontUrl: z.url().nullable(), backUrl: z.url().nullable() }),
]);
export const draftSummarySchema = draftMetaSchema.extend({ label: z.string().max(2000), saving: z.boolean() });
export const draftListSchema = z.object({ drafts: z.array(draftSummarySchema).max(5) });
export const draftMessages = {
  UNAUTHORIZED: "Your session has expired. Sign in in a new tab, then retry. Your current scan is still here.",
  FORBIDDEN: "This draft request is not allowed.",
  INVALID_DRAFT: "Unable to recover or store these draft values. Your current scan has been kept.",
  NOT_FOUND: "This draft is unavailable, expired, or was discarded.",
  CONFLICT: "This draft changed in another tab. Your current edits have been kept. Reload the draft before replacing its saved version.",
  BUSY: "This draft may still be saving. Wait a few minutes, then retry to check the same submission.",
  LIMIT: "You have reached the draft or image limit. Discard an unused draft, or wait ten minutes before replacing more images.",
  UNAVAILABLE: "Draft recovery is temporarily unavailable. Your current scan has been kept; retry before leaving.",
  IMAGE_UNAVAILABLE: "Unable to recover the original draft image. Keep your current scan and retry; no card was created.",
} as const;
export type DraftErrorCode = keyof typeof draftMessages;
export class DraftError extends Error {
  constructor(readonly code: DraftErrorCode) { super(draftMessages[code]); }
}
