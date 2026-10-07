import { z } from "zod";
import { extractedCardSchema } from "@/lib/ai/card-schema";
import { reviewedCardSchema } from "./review";

export const saveCardSchema = z.strictObject({
  submissionId: z.uuid(),
  reviewConfirmed: z.literal(true),
  aiExtraction: extractedCardSchema,
  reviewedData: reviewedCardSchema,
});
export type SaveCardPayload = z.infer<typeof saveCardSchema>;

export function createSubmissionId(): string {
  // getRandomValues also works on an HTTP LAN origin, where randomUUID may
  // be unavailable. This keeps phone capture/review usable during local dev.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const saveMessages = {
  UNAUTHORIZED: "Your session has expired. Sign in again before saving. Your draft is still here.",
  AUTH_UNAVAILABLE: "Unable to verify your session. Please try saving again.",
  FORBIDDEN: "This save request is not allowed.",
  INVALID_SAVE: "Unable to save these values. Review the fields and confirm again.",
  INVALID_IMAGE: "Choose a valid, readable JPG, PNG, or WEBP image of 10 MB or less.",
  UPLOAD_FAILED: "Unable to upload the original image. Your draft is still here; try again.",
  INSERT_FAILED: "Unable to save the card. The uploaded image was removed. Your draft is still here; try again.",
  CLEANUP_FAILED: "Unable to save the card, and its uploaded image could not be removed. Your draft is still here. Contact the administrator before retrying.",
  SAVE_IN_PROGRESS: "This submission is already being saved. Wait a moment, then try again.",
  SAVE_STATUS_UNKNOWN: "Unable to confirm whether the card was saved. Your draft is still here. Retry saving to check the same submission.",
} as const;
export type SaveErrorCode = keyof typeof saveMessages;
export const saveResponseSchema = z.discriminatedUnion("success", [
  z.strictObject({ success: z.literal(true), id: z.uuid() }),
  z.strictObject({ success: z.literal(false), error: z.strictObject({
    code: z.enum(Object.keys(saveMessages) as [SaveErrorCode, ...SaveErrorCode[]]),
    message: z.string(),
  }) }),
]);
