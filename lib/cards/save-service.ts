import "server-only";
import { createHash } from "node:crypto";
import type { ExtractionImage } from "@/lib/ai/types";
import type { Database } from "@/types/database";
import { saveCardSchema, saveMessages, type SaveCardPayload, type SaveErrorCode } from "./save-schema";
import { duplicateFingerprint } from "./duplicate-check";
import type { DuplicateInput, DuplicateMatch, DuplicateWarning } from "./duplicates";

export class SaveError extends Error {
  constructor(readonly code: SaveErrorCode) { super(saveMessages[code]); }
}
export class DuplicateWarningError extends SaveError {
  constructor(readonly warning: DuplicateWarning) { super("POSSIBLE_DUPLICATES"); }
}
export type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];
export interface CardSaveStore {
  findCard: (id: string) => Promise<{ id: string } | null>;
  findDuplicates: (data: DuplicateInput, excludedId: string) => Promise<DuplicateMatch[]>;
  upload: (path: string, image: ExtractionImage) => Promise<"uploaded" | "exists">;
  insert: (record: CardInsert) => Promise<void>;
  remove: (path: string) => Promise<boolean>;
}
export interface SaveContext { userId: string; store: CardSaveStore }

// UUID v5, using the authenticated owner as the namespace. A retry of the
// same reviewed submission addresses the same record, including across servers.
export function submissionCardId(userId: string, submissionId: string) {
  const hash = createHash("sha1")
    .update(Buffer.from(userId.replaceAll("-", ""), "hex"))
    .update(submissionId).digest().subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildCardInsert(userId: string, id: string, path: string, payload: SaveCardPayload): CardInsert {
  const card = payload.reviewedData;
  return {
    id, user_id: userId, original_image_path: path,
    card_type: card.cardType, name: card.name, company: card.company,
    job_title: card.jobTitle, department: card.department, email: card.email,
    phone: card.phone, secondary_phone: card.secondaryPhone, website: card.website,
    address: card.address, card_number: card.cardNumber,
    extra_fields: card.extraFields,
    raw_ocr_text: payload.aiExtraction.rawText,
    ai_extraction: payload.aiExtraction,
    ai_confidence: payload.aiExtraction.overallConfidence,
    scan_status: "completed", is_archived: false,
  };
}

const inFlight = new Set<string>();
export async function saveReviewedCard(context: SaveContext, input: SaveCardPayload, image: ExtractionImage) {
  const payload = saveCardSchema.parse(input);
  const id = submissionCardId(context.userId, payload.submissionId);
  const key = `${context.userId}/${id}`;
  if (inFlight.has(key)) throw new SaveError("SAVE_IN_PROGRESS");
  inFlight.add(key);
  try {
    const existing = await context.store.findCard(id);
    if (existing) return existing.id;
    let matches: DuplicateMatch[];
    try { matches = await context.store.findDuplicates(payload.reviewedData, id); }
    catch { throw new SaveError("DUPLICATE_CHECK_FAILED"); }
    if (matches.length) {
      const fingerprint = duplicateFingerprint(context.userId, payload.submissionId, payload.reviewedData, matches);
      if (payload.duplicateAcknowledgement?.fingerprint !== fingerprint)
        throw new DuplicateWarningError({ matches, fingerprint });
    }
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/png" ? "png" : "webp";
    const path = `${key}/original.${extension}`;
    const uploaded = await context.store.upload(path, image);
    if (uploaded === "exists") {
      const committed = await context.store.findCard(id);
      if (committed) return committed.id;
      // An earlier response may have been lost after upload. Retry the same
      // primary key without replacing the original or deleting a shared image.
      try { await context.store.insert(buildCardInsert(context.userId, id, path, payload)); }
      catch {
        const retried = await context.store.findCard(id);
        if (retried) return retried.id;
        throw new SaveError("SAVE_IN_PROGRESS");
      }
      return id;
    }
    try {
      await context.store.insert(buildCardInsert(context.userId, id, path, payload));
    } catch {
      // A transport error can follow a committed insert. Check before deleting
      // its image; if this check also fails, preserve it and report uncertainty.
      const committed = await context.store.findCard(id);
      if (committed) return committed.id;
      let cleaned = false;
      try { cleaned = await context.store.remove(path); } catch { /* Controlled failure below. */ }
      if (!cleaned) throw new SaveError("CLEANUP_FAILED");
      throw new SaveError("INSERT_FAILED");
    }
    console.info("Card created");
    return id;
  } finally { inFlight.delete(key); }
}
