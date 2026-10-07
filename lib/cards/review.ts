import { z } from "zod";
import { standardFields } from "@/lib/ai/card-schema";
import type { ExtractedCard } from "@/lib/ai/types";

export type StandardField = (typeof standardFields)[number];
export const fieldLabels: Record<StandardField, string> = {
  name: "Name", company: "Company", jobTitle: "Job title", department: "Department",
  email: "Email", phone: "Phone", secondaryPhone: "Secondary phone", website: "Website",
  address: "Address", cardNumber: "Card number", cardType: "Card type",
};
export const reviewFieldOrder: StandardField[] = [
  "name", "company", "jobTitle", "department", "email", "phone", "secondaryPhone",
  "website", "address", "cardNumber", "cardType",
];
const text = z.string().trim().max(2000, "Use 2,000 characters or fewer.");
const optionalText = text.nullable().transform(value => value === "" ? null : value);
const confidence = z.number().min(0).max(1).nullable();
const fields = Object.fromEntries(standardFields.map(key => [key, optionalText])) as Record<StandardField, typeof optionalText>;
const scores = Object.fromEntries(standardFields.map(key => [key, confidence])) as Record<StandardField, typeof confidence>;

// Human corrections have a separate contract: absent AI scores remain null,
// and unknown labels can be explicitly confirmed without fabricating a label.
export const reviewedCardSchema = z.strictObject({
  ...fields,
  fieldConfidences: z.strictObject(scores),
  extraFields: z.array(z.strictObject({
    label: optionalText,
    key: z.string().max(100).regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "Invalid field key."),
    value: text.min(1, "Enter a value or remove this field."),
    confidence,
  })).max(100, "Use at most 100 additional fields."),
}).superRefine((card, ctx) => {
  if (card.email !== null && !z.email().safeParse(card.email).success)
    ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address or leave it blank." });
  for (const key of standardFields) {
    if (card[key] === null && card.fieldConfidences[key] !== null)
      ctx.addIssue({ code: "custom", path: ["fieldConfidences", key], message: "Empty fields cannot have confidence scores." });
  }
});
export type ReviewedCard = z.output<typeof reviewedCardSchema>;
export interface DraftExtraField {
  id: string;
  label: string;
  key: string;
  value: string;
  confidence: number | null;
}
export interface ReviewDraft {
  fields: Record<StandardField, string>;
  fieldConfidences: Record<StandardField, number | null>;
  extraFields: DraftExtraField[];
}
export interface ReviewedScan {
  originalImage: File;
  rawText: string | null;
  aiExtraction: ExtractedCard;
  reviewedData: ReviewedCard;
}

export function createReviewDraft(source: ExtractedCard | ReviewedCard): ReviewDraft {
  return {
    fields: Object.fromEntries(standardFields.map(key => [key, source[key] ?? ""])) as ReviewDraft["fields"],
    fieldConfidences: { ...source.fieldConfidences },
    extraFields: source.extraFields.map((field, index) => ({ ...field, label: field.label ?? "", id: `ai-${index}` })),
  };
}
export function editStandardField(draft: ReviewDraft, key: StandardField, value: string): ReviewDraft {
  return { ...draft, fields: { ...draft.fields, [key]: value }, fieldConfidences: { ...draft.fieldConfidences, [key]: null } };
}
function customKey(label: string, others: DraftExtraField[]) {
  const base = label.trim() ? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "field_$&").slice(0, 80).replace(/_+$/g, "") || "custom_field" : "unknown_field";
  let key = base;
  let suffix = 2;
  while (others.some(field => field.key === key)) key = `${base}_${suffix++}`;
  return key;
}
export function editExtraField(draft: ReviewDraft, id: string, change: Partial<Pick<DraftExtraField, "label" | "value">>): ReviewDraft {
  return { ...draft, extraFields: draft.extraFields.map(field => field.id !== id ? field : {
    ...field, ...change, confidence: null,
    key: change.label === undefined ? field.key : customKey(change.label, draft.extraFields.filter(other => other.id !== id)),
  }) };
}
export function addExtraField(draft: ReviewDraft, id: string): ReviewDraft {
  return { ...draft, extraFields: [...draft.extraFields, { id, label: "", value: "", key: customKey("", draft.extraFields), confidence: null }] };
}
export function removeExtraField(draft: ReviewDraft, id: string): ReviewDraft {
  return { ...draft, extraFields: draft.extraFields.filter(field => field.id !== id) };
}
export function convertExtraField(draft: ReviewDraft, id: string, target: StandardField): { draft: ReviewDraft; error?: string } {
  const extra = draft.extraFields.find(field => field.id === id);
  if (!extra) return { draft, error: "This field is no longer available." };
  if (!extra.value.trim()) return { draft, error: "Enter a value before converting this field." };
  if (draft.fields[target].trim()) return { draft, error: `${fieldLabels[target]} already has a value. Copy it elsewhere or clear it before converting. Both values have been kept.` };
  return { draft: {
    fields: { ...draft.fields, [target]: extra.value },
    fieldConfidences: { ...draft.fieldConfidences, [target]: extra.confidence },
    extraFields: draft.extraFields.filter(field => field.id !== id),
  } };
}
export function validateReviewDraft(draft: ReviewDraft) {
  return reviewedCardSchema.safeParse({
    ...draft.fields, fieldConfidences: draft.fieldConfidences,
    extraFields: draft.extraFields.map(({ label, key, value, confidence }) => ({ label, key, value, confidence })),
  });
}
export function prepareReviewedScan(originalImage: File, source: ExtractedCard, data: ReviewedCard): ReviewedScan {
  return { originalImage, rawText: source.rawText, aiExtraction: structuredClone(source), reviewedData: reviewedCardSchema.parse(data) };
}
