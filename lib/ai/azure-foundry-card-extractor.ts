import "server-only";
import { z } from "zod";
import { cardOutputSchema, twoSideOutputSchema } from "./card-schema";
import { ExtractionError } from "./errors";
import { CARD_EXTRACTION_PROMPT, TWO_SIDE_PROMPT } from "./prompts";
import { responseImageContent } from "./provider-images";
import type { CardExtractor, ExtractionImage } from "./types";

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});

export class AzureFoundryCardExtractor implements CardExtractor {
  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      endpoint: string;
    },
    private readonly request: typeof fetch = fetch,
  ) {}

  async extract(image: ExtractionImage, signal: AbortSignal, back?: ExtractionImage): Promise<unknown> {
    try {
      const response = await this.request(this.config.endpoint, {
        method: "POST",
        signal,
        cache: "no-store",
        headers: {
          "api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          store: false,
          max_output_tokens: 8000,
          input: [
            { role: "system", content: back ? TWO_SIDE_PROMPT : CARD_EXTRACTION_PROMPT },
            {
              role: "user",
              content: responseImageContent(image, back),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "card_extraction",
              strict: true,
              schema: z.toJSONSchema(back ? twoSideOutputSchema : cardOutputSchema, { target: "draft-7" }),
            },
          },
        }),
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
      const result = responseSchema.safeParse(envelope);
      if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
      const content = result.data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? []);
      if (content.some((item) => item.type === "refusal"))
        throw new ExtractionError("EXTRACTION_FAILED");
      const text = content
        .filter((item) => item.type === "output_text")
        .map((item) => item.text ?? "")
        .join("");
      if (!text || text.length > 100000)
        throw new ExtractionError("EXTRACTION_FAILED");
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new ExtractionError("EXTRACTION_FAILED");
      }
    } catch (error: unknown) {
      if (signal.aborted) throw new ExtractionError("EXTRACTION_TIMEOUT");
      if (error instanceof ExtractionError) throw error;
      throw new ExtractionError("PROVIDER_UNAVAILABLE");
    }
  }
}
