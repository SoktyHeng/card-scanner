import "server-only";
import { extractedCardSchema, twoSideCardSchema } from "./card-schema";
import { combineCardSides } from "./card-sides";
import { getAiEnv } from "./env";
import { ExtractionError } from "./errors";
import { OpenAiCardExtractor } from "./openai-card-extractor";
import { MoonshotCardExtractor } from "./moonshot-card-extractor";
import { NvidiaCardExtractor } from "./nvidia-card-extractor";
import { AzureFoundryCardExtractor } from "./azure-foundry-card-extractor";
import type { CardExtractor, ExtractedCard, ExtractionImage } from "./types";

export function createCardExtractor(): CardExtractor {
  const config = getAiEnv();
  if (config.provider === "moonshot") return new MoonshotCardExtractor(config);
  if (config.provider === "nvidia") return new NvidiaCardExtractor(config);
  if (config.provider === "azure-foundry")
    return new AzureFoundryCardExtractor({
      ...config,
      endpoint: config.endpoint!,
    });
  return new OpenAiCardExtractor(config);
}

export async function extractCard(
  image: ExtractionImage,
  signal: AbortSignal,
  provider: CardExtractor = createCardExtractor(),
  back?: ExtractionImage,
): Promise<ExtractedCard> {
  const output = await provider.extract(image, signal, back);
  if (back) {
    const sides = twoSideCardSchema.safeParse(output);
    if (!sides.success) throw new ExtractionError("EXTRACTION_FAILED");
    try { return combineCardSides(sides.data); }
    catch { throw new ExtractionError("EXTRACTION_FAILED"); }
  }
  const result = extractedCardSchema.safeParse(output);
  if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
  return result.data;
}
