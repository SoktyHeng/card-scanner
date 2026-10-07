import "server-only";
import { extractedCardSchema } from "./card-schema";
import { ExtractionError } from "./errors";
import { readExtractionImage } from "./upload";
import { EXTRACTION_TIMEOUT_MS } from "./timeouts";
import type { ExtractedCard, ExtractionImage } from "./types";

export interface ExtractionDependencies {
  authenticate: () => Promise<boolean>;
  extract: (
    image: ExtractionImage,
    signal: AbortSignal,
  ) => Promise<ExtractedCard>;
}

export function createExtractionHandler(deps: ExtractionDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const origin = request.headers.get("origin");
      if (origin) {
        // Next can reconstruct an internal URL when accessed through a LAN
        // address or reverse proxy. Compare the browser origin to its public host.
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
        let originHost: string;
        try { originHost = new URL(origin).host; }
        catch { throw new ExtractionError("FORBIDDEN"); }
        if (originHost !== host) throw new ExtractionError("FORBIDDEN");
      }
      let authenticated: boolean;
      try {
        authenticated = await deps.authenticate();
      } catch {
        throw new ExtractionError("AUTH_UNAVAILABLE");
      }
      if (!authenticated) throw new ExtractionError("UNAUTHORIZED");
      const image = await readExtractionImage(request);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      ]);
      console.info("Card extraction started");
      const result = extractedCardSchema.safeParse(
        await deps.extract(image, signal),
      );
      if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
      console.info("Card extraction completed");
      return Response.json(
        { success: true, data: result.data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error: unknown) {
      const failure =
        error instanceof ExtractionError
          ? error
          : new ExtractionError("EXTRACTION_FAILED");
      console.warn("Card extraction failed", { code: failure.code });
      return Response.json(
        {
          success: false,
          error: { code: failure.code, message: failure.message },
        },
        {
          status: failure.status,
          headers: {
            "Cache-Control": "private, no-store",
            ...(failure.status === 429 ? { "Retry-After": "30" } : {}),
          },
        },
      );
    }
  };
}
