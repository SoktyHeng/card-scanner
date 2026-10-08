import type { z } from "zod";
import type { extractedCardSchema, extraFieldSchema } from "./card-schema";
import type { ImageMimeType } from "@/lib/utils/image";

export type ExtraField = z.infer<typeof extraFieldSchema>;
export type ExtractedCard = z.infer<typeof extractedCardSchema>;
export interface ExtractionImage {
  bytes: Uint8Array;
  mimeType: ImageMimeType;
}

// Providers return untrusted data; the service always validates it.
export interface CardExtractor {
  extract(image: ExtractionImage, signal: AbortSignal, back?: ExtractionImage): Promise<unknown>;
}
