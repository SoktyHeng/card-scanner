export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ImageSelection {
  file: File;
  mimeType: ImageMimeType;
  previewUrl: string;
  width: number;
  height: number;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

// Content determines the format; file extensions and browser MIME are only hints.
export async function validateImageFile(file: File): Promise<ImageMimeType> {
  if (file.size === 0)
    throw new ImageValidationError(
      "This file is empty. Choose a JPG, PNG, or WEBP image.",
    );
  if (file.size > MAX_IMAGE_BYTES)
    throw new ImageValidationError(
      "This image is too large. Choose an image of 10 MB or less.",
    );
  let header: Uint8Array;
  try {
    header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  } catch {
    throw new ImageValidationError(
      "Unable to read this file. Please select it again or choose another image.",
    );
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff)
    return "image/jpeg";
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => header[index] === byte,
    )
  )
    return "image/png";
  const text = (start: number, end: number) =>
    String.fromCharCode(...header.slice(start, end));
  if (
    text(0, 4) === "RIFF" &&
    text(8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(text(12, 16))
  )
    return "image/webp";
  throw new ImageValidationError(
    "Unsupported file content. Choose a JPG, JPEG, PNG, or WEBP image. Renaming a file does not change its format.",
  );
}

export async function createImagePreview(
  file: File,
  signal?: AbortSignal,
): Promise<ImageSelection> {
  const mimeType = await validateImageFile(file);
  signal?.throwIfAborted();
  // A camera/file picker may omit or misreport the MIME. Keep the original file
  // and use a correctly typed blob for decoding and previewing it locally.
  const previewUrl = URL.createObjectURL(new Blob([file], { type: mimeType }));
  const image = new Image();
  let released = false;
  const release = () => {
    if (!released) URL.revokeObjectURL(previewUrl);
    released = true;
  };
  let abort: (() => void) | undefined;
  try {
    image.src = previewUrl;
    const aborted = new Promise<never>((_, reject) => {
      abort = () => {
        image.src = "";
        release();
        reject(new DOMException("Image selection canceled", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    });
    await Promise.race([image.decode(), aborted]);
    signal?.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Empty image dimensions");
    return {
      file,
      mimeType,
      previewUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch {
    release();
    if (signal?.aborted)
      throw new DOMException("Image selection canceled", "AbortError");
    throw new ImageValidationError(
      "Unable to open this image. It may be damaged or incomplete. Try another image or take a new photo.",
    );
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export function releaseImagePreview(image: ImageSelection | null) {
  if (image) URL.revokeObjectURL(image.previewUrl);
}
