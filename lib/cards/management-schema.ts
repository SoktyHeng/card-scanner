import { organizationSchema } from "./organization-schema";
import { z } from "zod";
import type { CardRow } from "@/types/database";
import { reviewedCardSchema, reviewFieldOrder, type ReviewedCard, type StandardField } from "./review";

export const cardColumns: Record<StandardField, keyof Pick<CardRow, "name" | "company" | "job_title" | "department" | "email" | "phone" | "secondary_phone" | "website" | "address" | "card_number" | "card_type">> = {
  name: "name", company: "company", jobTitle: "job_title", department: "department",
  email: "email", phone: "phone", secondaryPhone: "secondary_phone", website: "website",
  address: "address", cardNumber: "card_number", cardType: "card_type",
};
export const cardMutationSchema = z.discriminatedUnion("operation", [
  organizationSchema,
  z.strictObject({ operation: z.literal("update"), expectedUpdatedAt: z.iso.datetime({ offset: true }), reviewedData: reviewedCardSchema }),
  z.strictObject({ operation: z.enum(["archive", "restore"]) }),
]);
export const cardDeleteSchema = z.strictObject({ confirmed: z.literal(true) });
export function savedCardDraft(card: CardRow): ReviewedCard {
  return reviewedCardSchema.parse({
    ...Object.fromEntries(reviewFieldOrder.map(key => [key, card[cardColumns[key]]])),
    fieldConfidences: Object.fromEntries(reviewFieldOrder.map(key => [key, null])),
    extraFields: card.extra_fields,
  });
}
export function correctedColumns(data: ReviewedCard) {
  const validated = reviewedCardSchema.parse(data);
  return { ...Object.fromEntries(reviewFieldOrder.map(key => [cardColumns[key], validated[key]])), extra_fields: validated.extraFields };
}
export function ownsImagePath(userId: string, id: string, path: string) {
  return path.startsWith(`${userId}/${id}/`) && !path.includes("..") && !path.includes("\\") && path.split("/").length === 3;
}
