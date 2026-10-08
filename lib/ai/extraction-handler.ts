import "server-only";
import { extractedCardSchema } from "./card-schema";
import { ExtractionError } from "./errors";
import { readExtractionImage } from "./upload";
import { EXTRACTION_TIMEOUT_MS } from "./timeouts";
import { prepareExtractionImage } from "./prepare-image";
import type { ExtractedCard, ExtractionImage } from "./types";
import { isSameOriginRequest } from "@/lib/auth/request-origin";
import { acquireExtraction } from "./extraction-limit";
import { awaitExtraction } from "./abortable";

export interface ExtractionDependencies {
  authenticate: () => Promise<boolean | string | null>;
  acquire?: (userId: string) => () => void;
  extract: (
    image: ExtractionImage,
    signal: AbortSignal,
  ) => Promise<ExtractedCard>;
}

export function createExtractionHandler(deps: ExtractionDependencies) {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    let release: (() => void) | undefined;
    try {
      if (!isSameOriginRequest(request)) throw new ExtractionError("FORBIDDEN");
      let authenticated: boolean | string | null;
      try {
        authenticated = await deps.authenticate();
      } catch {
        throw new ExtractionError("AUTH_UNAVAILABLE");
      }
      if (!authenticated) throw new ExtractionError("UNAUTHORIZED");
      if (typeof authenticated === "string") release = (deps.acquire ?? acquireExtraction)(authenticated);
      const originalImage = await readExtractionImage(request);
      const image = await prepareExtractionImage(originalImage);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      ]);
      console.info("Card extraction started", {
        originalBytes: originalImage.bytes.byteLength,
        aiBytes: image.bytes.byteLength,
        timeoutMs: EXTRACTION_TIMEOUT_MS,
      });
      const result = extractedCardSchema.safeParse(
        await awaitExtraction(signal, () => deps.extract(image, signal)),
      );
      if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
      console.info("Card extraction completed", { elapsedMs: Date.now() - startedAt });
      return Response.json(
        { success: true, data: result.data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error: unknown) {
      const failure =
        error instanceof ExtractionError
          ? error
          : new ExtractionError("EXTRACTION_FAILED");
      console.warn("Card extraction failed", { code: failure.code, elapsedMs: Date.now() - startedAt });
      return Response.json(
        {
          success: false,
          error: { code: failure.code, message: failure.message },
        },
        {
          status: failure.status,
          headers: {
            "Cache-Control": "private, no-store",
            ...(failure.status === 429 ? { "Retry-After": failure.code === "REQUEST_RATE_LIMITED" ? "60" : "30" } : {}),
          },
        },
      );
    } finally { release?.(); }
  };
}
