import "server-only";
import { z } from "zod";
import { cardOutputSchema } from "./card-schema";
import { ExtractionError } from "./errors";
import { CARD_EXTRACTION_PROMPT } from "./prompts";
import type { CardExtractor, ExtractionImage } from "./types";

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.literal("stop"),
    message: z.object({
      content: z.string().min(1).max(100000),
      refusal: z.string().nullable().optional(),
    }),
  })).min(1),
});

export class MoonshotCardExtractor implements CardExtractor {
  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async extract(image: ExtractionImage, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await this.request("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          reasoning_effort: "low",
          messages: [
            { role: "system", content: CARD_EXTRACTION_PROMPT },
            { role: "user", content: [
              { type: "text", text: "Extract only the information visible on this card." },
              { type: "image_url", image_url: {
                url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`,
              } },
            ] },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "card_extraction",
              strict: true,
              schema: z.toJSONSchema(cardOutputSchema, { target: "draft-7" }),
            },
          },
        }),
      });
      if (!response.ok) {
        let errorType = "unknown";
        try {
          const body: unknown = await response.json();
          const parsed = z.object({ error: z.object({ type: z.enum([
            "exceeded_current_quota_error", "rate_limit_reached_error",
            "engine_overloaded_error", "invalid_authentication_error",
          ]) }) }).safeParse(body);
          if (parsed.success) errorType = parsed.data.error.type;
        } catch { /* Non-JSON failures still return a controlled error. */ }
        // Only allowlisted types are logged; never log upstream messages or data.
        console.warn("Moonshot extraction request failed", { status: response.status, type: errorType });
        if (errorType === "exceeded_current_quota_error")
          throw new ExtractionError("PROVIDER_QUOTA_EXCEEDED");
        throw new ExtractionError(response.status === 429
          ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE");
      }
      let envelope: unknown;
      try { envelope = await response.json(); }
      catch { throw new ExtractionError("EXTRACTION_FAILED"); }
      const parsed = completionSchema.safeParse(envelope);
      if (!parsed.success) throw new ExtractionError("EXTRACTION_FAILED");
      const message = parsed.data.choices[0].message;
      if (message.refusal) throw new ExtractionError("EXTRACTION_FAILED");
      // Ignore reasoning_content; only final content is extracted and validated.
      try { return JSON.parse(message.content) as unknown; }
      catch { throw new ExtractionError("EXTRACTION_FAILED"); }
    } catch (error: unknown) {
      if (signal.aborted) throw new ExtractionError("EXTRACTION_TIMEOUT");
      if (error instanceof ExtractionError) throw error;
      throw new ExtractionError("PROVIDER_UNAVAILABLE");
    }
  }
}
