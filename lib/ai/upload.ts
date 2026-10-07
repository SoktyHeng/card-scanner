import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_BYTES, validateImageFile } from "@/lib/utils/image";
import { ExtractionError } from "./errors";
import type { ExtractionImage } from "./types";

// Bound the complete body even when Content-Length is absent or dishonest.
export const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1024;export async function readExtractionImage(
  request: Request,
): Promise<ExtractionImage> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data;")
  )
    throw new ExtractionError("INVALID_UPLOAD");
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_MULTIPART_BYTES)
    throw new ExtractionError("IMAGE_TOO_LARGE");
  if (!request.body) throw new ExtractionError("INVALID_UPLOAD");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new ExtractionError("IMAGE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error: unknown) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("INVALID_UPLOAD");
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new ExtractionError("INVALID_UPLOAD");
  }
  const images = form.getAll("image");
  if (
    images.length !== 1 ||
    [...form.keys()].some((key) => key !== "image") ||
    !(images[0] instanceof File)
  )
    throw new ExtractionError("INVALID_UPLOAD");
  const file = images[0];
  if (file.size > MAX_IMAGE_BYTES) throw new ExtractionError("IMAGE_TOO_LARGE");
  try {
    const mimeType = await validateImageFile(file);
    const bytes = Buffer.from(await file.arrayBuffer());
    const decoder = sharp(bytes, {
      limitInputPixels: 40000000,
      failOn: "warning",
    });
    const metadata = await decoder.metadata();
    if (
      (metadata.pages ?? 1) > 1 ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    )
      throw new Error("Unsupported image");
    // A complete decode catches truncated files beyond their valid headers.
    await decoder.resize(1, 1).raw().toBuffer();
    return { bytes, mimeType };
  } catch {
    throw new ExtractionError("INVALID_IMAGE");
  }
}
