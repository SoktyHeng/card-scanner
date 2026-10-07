import "server-only";
import { z } from "zod";
import { ExtractionError } from "./errors";

const aiEnvSchema = z.strictObject({
  provider: z.enum(["openai", "moonshot", "nvidia", "azure-foundry"]).default("openai"),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1).max(200),
  endpoint: z.string().trim().url().optional(),
});
export function getAiEnv() {
  const result = aiEnvSchema.safeParse({
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
    endpoint: process.env.AZURE_FOUNDRY_ENDPOINT,
  });
  if (!result.success) throw new ExtractionError("AI_NOT_CONFIGURED");
  if (result.data.provider === "azure-foundry" && !result.data.endpoint)
    throw new ExtractionError("AI_NOT_CONFIGURED");
  if (result.data.endpoint === undefined) {
    const config = { ...result.data };
    delete config.endpoint;
    return config;
  }
  return result.data;
}
