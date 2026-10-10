import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { extractCard } from "../lib/ai/card-extractor";
import { awaitExtraction } from "../lib/ai/abortable";
import { getAiEnv } from "../lib/ai/env";
import { ExtractionError } from "../lib/ai/errors";
import { prepareExtractionImage } from "../lib/ai/prepare-image";
import { EXTRACTION_TIMEOUT_MS } from "../lib/ai/timeouts";
import { MAX_IMAGE_BYTES, validateImageFile } from "../lib/utils/image";
import { evaluateCard, evaluationManifestSchema } from "./ai-evaluation";

async function loadImage(path: string) {
  if ((await stat(path)).size > MAX_IMAGE_BYTES) throw new Error("Invalid fixture");
  const bytes = await readFile(path);
  const mimeType = await validateImageFile(new File([bytes], "fixture"));
  const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
  if (((await decoder.metadata()).pages ?? 1) !== 1) throw new Error("Invalid fixture");
  await decoder.stats(); // Decode even small fixtures before any paid request.
  return prepareExtractionImage({ bytes, mimeType });
}

async function main() {
  const [manifestPath, consentFlag, ...extra] = process.argv.slice(2);
  if (!manifestPath || consentFlag !== "--send-to-provider" || extra.length) {
    console.error("Usage: npm run evaluate:ai -- /path/to/manifest.json --send-to-provider");
    process.exitCode = 1;
    return;
  }
  loadEnvConfig(process.cwd());
  const manifest = evaluationManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const directory = dirname(resolve(manifestPath));
  // Validate every fixture before transmitting any image. Paths stay out of reports.
  const prepared = [];
  for (const item of manifest.cases) prepared.push({
    item,
    front: await loadImage(resolve(directory, item.image)),
    back: item.backImage ? await loadImage(resolve(directory, item.backImage)) : undefined,
  });
  const { provider, model } = getAiEnv();
  const results = [];
  for (const { item, front, back } of prepared) {
    const started = Date.now();
    const metadata = { id: item.id, capture: item.capture, cardType: item.cardType, languages: item.languages, conditions: item.conditions };
    try {
      const signal = AbortSignal.timeout(EXTRACTION_TIMEOUT_MS);
      const card = await awaitExtraction(signal, () => extractCard(front, signal, undefined, back));
      const evaluation = evaluateCard(item.expected, card);
      results.push({ ...metadata, ...evaluation, elapsedMs: Date.now() - started });
      console.log(`${evaluation.passed ? "PASS" : "FAIL"}: ${item.id}; ${evaluation.correctionsNeeded} corrections`);
    } catch (error: unknown) {
      const failure = error instanceof ExtractionError ? error.code : "EVALUATION_FAILED";
      results.push({ ...metadata, passed: false, elapsedMs: Date.now() - started, failure });
      console.log(`FAIL: ${item.id}; ${failure}`);
    }
  }
  const output = "test-results/ai-evaluation";
  await mkdir(output, { recursive: true });
  const reportPath = `${output}/report-${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify({ checkedAt: new Date().toISOString(), provider, model, results }, null, 2), { mode: 0o600 });
  console.log(`Evaluation: ${results.filter(result => result.passed).length}/${results.length} passed. Report: ${reportPath}`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

main().catch(() => {
  console.error("Evaluation could not start. Check manifest, permitted fixtures and provider configuration. No image paths, card values or credentials are logged.");
  process.exitCode = 1;
});
