import "server-only";
import { MAX_IMAGE_BYTES } from "@/lib/utils/image";
import { readBoundedMultipart, validateOriginalImage } from "@/lib/ai/upload";
import { saveCardSchema } from "./save-schema";
import { DuplicateWarningError, SaveError, saveReviewedCard, type SaveContext } from "./save-service";

export const MAX_SAVE_DATA_BYTES = 3 * 1024 * 1024;
export const MAX_SAVE_BODY_BYTES = MAX_IMAGE_BYTES + MAX_SAVE_DATA_BYTES + 64 * 1024;
export function createSaveCardHandler(authenticate: () => Promise<SaveContext | null>) {
  return async (request: Request): Promise<Response> => {
    try {
      const origin = request.headers.get("origin");
      if (origin) {
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
        let originHost: string;
        try { originHost = new URL(origin).host; } catch { throw new SaveError("FORBIDDEN"); }
        if (originHost !== host) throw new SaveError("FORBIDDEN");
      }
      let context: SaveContext | null;
      try { context = await authenticate(); } catch { throw new SaveError("AUTH_UNAVAILABLE"); }
      if (!context) throw new SaveError("UNAUTHORIZED");
      let form: FormData;
      try { form = await readBoundedMultipart(request, MAX_SAVE_BODY_BYTES); }
      catch { throw new SaveError("INVALID_SAVE"); }
      if ([...form.keys()].some(key => key !== "image" && key !== "data") || form.getAll("image").length !== 1 || form.getAll("data").length !== 1)
        throw new SaveError("INVALID_SAVE");
      const file = form.get("image"), json = form.get("data");
      if (!(file instanceof File) || typeof json !== "string" || Buffer.byteLength(json) > MAX_SAVE_DATA_BYTES)
        throw new SaveError("INVALID_SAVE");
      let input: unknown;
      try { input = JSON.parse(json) as unknown; } catch { throw new SaveError("INVALID_SAVE"); }
      const parsed = saveCardSchema.safeParse(input);
      if (!parsed.success) throw new SaveError("INVALID_SAVE");
      const image = await validateOriginalImage(file).catch(() => { throw new SaveError("INVALID_IMAGE"); });
      const id = await saveReviewedCard(context, parsed.data, image);
      return Response.json({ success: true, id }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error: unknown) {
      if (error instanceof DuplicateWarningError) return Response.json({ success: false,
        error: { code: error.code, message: error.message }, duplicateWarning: error.warning },
      { status: 409, headers: { "Cache-Control": "private, no-store" } });
      const failure = error instanceof SaveError ? error : new SaveError("SAVE_STATUS_UNKNOWN");
      console.warn("Card save failed", { code: failure.code });
      const status = failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403
        : failure.code === "INVALID_SAVE" || failure.code === "INVALID_IMAGE" ? 422
          : failure.code === "SAVE_IN_PROGRESS" ? 409 : 503;
      return Response.json({ success: false, error: { code: failure.code, message: failure.message } },
        { status, headers: { "Cache-Control": "private, no-store" } });
    }
  };
}
