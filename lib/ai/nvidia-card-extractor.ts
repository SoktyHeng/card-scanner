import "server-only";
import { z } from "zod";
import { cardOutputSchema } from "./card-schema";
import { ExtractionError } from "./errors";
import { CARD_EXTRACTION_PROMPT } from "./prompts";
import type { CardExtractor, ExtractionImage } from "./types";

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          content: z.string().min(1).max(100000),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

export class NvidiaCardExtractor implements CardExtractor {
  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async extract(image: ExtractionImage, signal: AbortSignal): Promise<unknown> {
    const startedAt = Date.now();
    let stage: "request" | "response_body" | "validation" = "request";
    try {
      const response = await this.request(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          signal,
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: 8192,
            // Muse Glimmer defaults to high reasoning. Card transcription only
            // needs a short trace; keep model-specific options out of other NIMs.
            ...(this.config.model === "meta/muse-glimmer-30b"
              ? {
                  reasoning_effort: "low",
                  chat_template_kwargs: { reasoning_strength: "low" },
                }
              : {}),
            messages: [
              {
                role: "system",
                content: `${CARD_EXTRACTION_PROMPT}\nJSON schema: ${JSON.stringify(z.toJSONSchema(cardOutputSchema, { target: "draft-7" }))}`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Extract only the information visible on this card.",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`,
                    },
                  },
                ],
              },
            ],
            response_format: { type: "json_object" },
          }),
        },
      );
      stage = "response_body";
      console.info("NVIDIA extraction response received", {
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      });
      if (response.status === 429)
        throw new ExtractionError("PROVIDER_RATE_LIMITED");
      if (!response.ok) throw new ExtractionError("PROVIDER_UNAVAILABLE");

      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new ExtractionError("EXTRACTION_FAILED");
      }
      const result = completionSchema.safeParse(envelope);
      stage = "validation";
      if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
      if (result.data.choices[0].message.refusal)
        throw new ExtractionError("EXTRACTION_FAILED");
      try {
        return JSON.parse(result.data.choices[0].message.content) as unknown;
      } catch {
        throw new ExtractionError("EXTRACTION_FAILED");
      }
    } catch (error: unknown) {
      if (signal.aborted) {
        console.warn("NVIDIA extraction aborted", { stage, elapsedMs: Date.now() - startedAt });
        throw new ExtractionError("EXTRACTION_TIMEOUT");
      }
      if (error instanceof ExtractionError) throw error;
      throw new ExtractionError("PROVIDER_UNAVAILABLE");
    }
  }
}
