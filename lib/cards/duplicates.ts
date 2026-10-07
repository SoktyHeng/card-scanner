import { z } from "zod";
import type { CardRow } from "@/types/database";

export const duplicateReasons = { email: "Matching email", phone: "Matching phone", card_number: "Matching card number", name_company: "Matching name and company" } as const;
export const duplicateMatchSchema = z.strictObject({
  id: z.uuid(), name: z.string().nullable(), company: z.string().nullable(), archived: z.boolean(),
  reasons: z.array(z.enum(["email", "phone", "card_number", "name_company"])).min(1),
});
export type DuplicateMatch = z.infer<typeof duplicateMatchSchema>;
export const duplicateWarningSchema = z.strictObject({ matches: z.array(duplicateMatchSchema).min(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
export type DuplicateWarning = z.infer<typeof duplicateWarningSchema>;
export const duplicateAcknowledgementSchema = z.strictObject({ confirmed: z.literal(true), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });

function trimmed(value: string | null | undefined) { return value?.trim().normalize("NFC") || null; }
export function normalizeEmail(value: string | null | undefined) { return trimmed(value)?.toLowerCase() ?? null; }
export function normalizePhone(value: string | null | undefined) {
  const display = trimmed(value);
  if (!display) return null;
  // Do not infer a country, strip leading zeroes, or join numbers/extensions.
  const formatted = display.replace(/[\s().-]/g, "");
  return /^\+?[0-9]+$/.test(formatted) ? formatted : display;
}
export function normalizeCardNumber(value: string | null | undefined) { return trimmed(value); }
export function normalizeNameCompany(value: string | null | undefined) { return trimmed(value)?.replace(/\s+/g, " ").toLowerCase() ?? null; }
export type DuplicateInput = { email: string | null; phone: string | null; secondaryPhone: string | null; cardNumber: string | null; name: string | null; company: string | null };
export type DuplicateCandidate = Pick<CardRow, "id" | "user_id" | "email" | "phone" | "secondary_phone" | "card_number" | "name" | "company" | "is_archived">;
export function duplicateSignals(card: DuplicateInput) {
  return {
    email: normalizeEmail(card.email),
    phones: [normalizePhone(card.phone), normalizePhone(card.secondaryPhone)].filter((phone): phone is string => phone !== null),
    cardNumber: normalizeCardNumber(card.cardNumber), name: normalizeNameCompany(card.name), company: normalizeNameCompany(card.company),
  };
}
export function hasDuplicateSignals(card: DuplicateInput) {
  const fields = duplicateSignals(card);
  return !!(fields.email || fields.phones.length || fields.cardNumber || (fields.name && fields.company));
}
export function matchDuplicate(card: DuplicateInput, candidate: DuplicateCandidate): DuplicateMatch | null {
  const fields = duplicateSignals(card);
  const reasons: DuplicateMatch["reasons"] = [];
  if (fields.email && fields.email === normalizeEmail(candidate.email)) reasons.push("email");
  const phones = [normalizePhone(candidate.phone), normalizePhone(candidate.secondary_phone)];
  if (fields.phones.some(phone => phones.includes(phone))) reasons.push("phone");
  if (fields.cardNumber && fields.cardNumber === normalizeCardNumber(candidate.card_number)) reasons.push("card_number");
  if (fields.name && fields.company && fields.name === normalizeNameCompany(candidate.name) && fields.company === normalizeNameCompany(candidate.company)) reasons.push("name_company");
  return reasons.length ? { id: candidate.id, name: candidate.name, company: candidate.company, archived: candidate.is_archived, reasons } : null;
}
