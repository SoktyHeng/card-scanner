import "server-only";
import { extractedCardSchema } from "./card-schema";
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
): Promise<ExtractedCard> {
  const result = extractedCardSchema.safeParse(
    await provider.extract(image, signal),
  );
  if (!result.success) throw new ExtractionError("EXTRACTION_FAILED");
  return result.data;
}
