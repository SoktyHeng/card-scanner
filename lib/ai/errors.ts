import "server-only";
import { extractionMessages, type ExtractionErrorCode } from "./card-schema";

const statuses: Record<ExtractionErrorCode, number> = {
  UNAUTHORIZED: 401,
  AUTH_UNAVAILABLE: 503,
  FORBIDDEN: 403,
  INVALID_UPLOAD: 400,
  IMAGE_TOO_LARGE: 413,
  INVALID_IMAGE: 422,
  AI_NOT_CONFIGURED: 503,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_RATE_LIMITED: 429,
  REQUEST_RATE_LIMITED: 429,
  PROVIDER_QUOTA_EXCEEDED: 503,
  EXTRACTION_TIMEOUT: 504,
  EXTRACTION_FAILED: 502,
};
export class ExtractionError extends Error {
  readonly status: number;
  constructor(readonly code: ExtractionErrorCode) {
    super(extractionMessages[code]);
    this.name = "ExtractionError";
    this.status = statuses[code];
  }
}
