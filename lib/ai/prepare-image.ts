import "server-only";
import sharp from "sharp";
import type { ExtractionImage } from "./types";

export const MAX_AI_IMAGE_EDGE = 2048;
export const MAX_AI_ORIGINAL_BYTES = 1024 * 1024;

// Prepare a working copy for inference. The scanner retains the original File
// independently for preview, human review, and the future storage handoff.
export async function prepareExtractionImage(image: ExtractionImage): Promise<ExtractionImage> {
  const decoder = sharp(image.bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await decoder.metadata();
  if (
    (metadata.width ?? 0) <= MAX_AI_IMAGE_EDGE &&
    (metadata.height ?? 0) <= MAX_AI_IMAGE_EDGE &&
    image.bytes.byteLength <= MAX_AI_ORIGINAL_BYTES &&
    (!metadata.orientation || metadata.orientation === 1)
  ) return image;

  const bytes = await decoder.autoOrient()
    .resize({ width: MAX_AI_IMAGE_EDGE, height: MAX_AI_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return { bytes, mimeType: "image/jpeg" };
}
