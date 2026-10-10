import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { extractCard } from "../lib/ai/card-extractor";
import { prepareExtractionImage } from "../lib/ai/prepare-image";
import { EXTRACTION_TIMEOUT_MS } from "../lib/ai/timeouts";
import { ExtractionError } from "../lib/ai/errors";
import type { ExtractedCard } from "../lib/ai/types";

// This opt-in live check sends only generated fictional cards to the configured
// provider. It consumes API quota, does not use real scans, and writes no DB rows.
type Scenario = {
  id: string;
  lines: string[];
  fields: Partial<Record<"name" | "company" | "jobTitle" | "department" | "email" | "phone", string>>;
  values?: string[];
  unknown?: boolean;
};
const scenarios: Scenario[] = [
  { id: "business", lines: ["BUSINESS CARD", "John Smith", "Senior Engineer", "ABC Technology", "+855 12 345 678", "john@example.com", "Employee Code: EMP-00123", "Branch: Phnom Penh"], fields: { name: "John Smith", company: "ABC Technology", jobTitle: "Senior Engineer", email: "john@example.com", phone: "+855 12 345 678" }, values: ["EMP-00123", "Phnom Penh"] },
  { id: "membership", lines: ["MEMBERSHIP CARD", "Member Name: Sokha", "Member No: MB-10023", "Tier: Gold", "Valid Until: 31/12/2027"], fields: { name: "Sokha" }, values: ["MB-10023", "Gold", "31/12/2027"] },
  { id: "employee", lines: ["EMPLOYEE CARD", "Jane Lim", "Finance Manager", "Employee ID: EMP-0029", "Department: Finance"], fields: { name: "Jane Lim", jobTitle: "Finance Manager", department: "Finance" }, values: ["EMP-0029"] },
  { id: "unknown", lines: ["ABC-7788"], fields: {}, unknown: true },
  { id: "khmer", lines: ["ឈ្មោះ: សុខា", "ទូរស័ព្ទ: +855 12 345 678", "អ៊ីមែល: sokha@example.com"], fields: { name: "សុខា", phone: "+855 12 345 678", email: "sokha@example.com" } },
];

function equalText(actual: string | null | undefined, expected: string): boolean {
  return actual?.normalize("NFC").trim().toLowerCase() === expected.normalize("NFC").trim().toLowerCase();
}

function check(scenario: Scenario, card: ExtractedCard): string[] {
  const failures: string[] = [];
  for (const [key, expected] of Object.entries(scenario.fields)) {
    if (!equalText(card[key as keyof Scenario["fields"]], expected)) failures.push(`incorrect ${key}`);
  }
  const values = [card.cardNumber, ...card.extraFields.map(field => field.value)];
  for (const value of scenario.values ?? []) {
    if (!values.some(actual => equalText(actual, value))) failures.push("missing custom/card-number value");
  }
  // None of these images supplies a website, secondary phone or address.
  for (const key of ["website", "secondaryPhone", "address"] as const) {
    if (card[key] !== null) failures.push(`invented ${key}`);
  }
  if (scenario.id === "membership" || scenario.id === "employee" || scenario.unknown) {
    for (const key of ["email", "phone", "company"] as const) {
      if (card[key] !== null) failures.push(`invented ${key}`);
    }
  }
  if (scenario.unknown) {
    if ([card.name, card.jobTitle, card.department, card.cardNumber].some(value => value !== null)) failures.push("guessed meaning of unlabeled code");
    if (!card.extraFields.some(field => field.label === null && field.key === "unknown_field" && field.value === "ABC-7788" && field.confidence < 0.5)) failures.push("unlabeled code not preserved as low-confidence unknown");
  }
  return failures;
}

async function main() {
  loadEnvConfig(process.cwd());
  const outputDirectory = "test-results/live-ai";
  await mkdir(outputDirectory, { recursive: true });
  const results: Array<{ scenario: string; passed: boolean; elapsedMs: number; failures: string[] }> = [];
  for (const scenario of scenarios) {
    const started = Date.now();
    try {
      // Pango shapes Khmer using an explicitly supplied font when needed.
      const fontFile = scenario.id === "khmer" ? process.env.VERIFY_KHMER_FONT_FILE : undefined;
      const text = await sharp({ text: { text: scenario.lines.join("\n"), font: scenario.id === "khmer" ? "Khmer Sangam MN 42" : "Arial 42", ...(fontFile ? { fontfile: fontFile } : {}), rgba: true, width: 1100, spacing: 24 } }).png().toBuffer();
      const height = Math.max(720, (await sharp(text).metadata()).height! + 140);
      const bytes = await sharp({ create: { width: 1240, height, channels: 3, background: "white" } }).composite([{ input: text, top: 70, left: 70 }]).png().toBuffer();
      await writeFile(`${outputDirectory}/${scenario.id}.png`, bytes);
      const image = await prepareExtractionImage({ bytes, mimeType: "image/png" });
      const card = await extractCard(image, AbortSignal.timeout(EXTRACTION_TIMEOUT_MS));
      const failures = check(scenario, card);
      results.push({ scenario: scenario.id, passed: failures.length === 0, elapsedMs: Date.now() - started, failures });
      console.log(`${failures.length ? "FAIL" : "PASS"}: ${scenario.id} (${Date.now() - started} ms)${failures.length ? `: ${failures.join(", ")}` : ""}`);
    } catch (error: unknown) {
      const failure = error instanceof ExtractionError ? error.code : "FIXTURE_OR_PROVIDER_CHECK_FAILED";
      results.push({ scenario: scenario.id, passed: false, elapsedMs: Date.now() - started, failures: [failure] });
      console.log(`FAIL: ${scenario.id}: ${failure}`);
    }
  }
  await writeFile(`${outputDirectory}/report.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  console.log(`Live AI checks: ${results.filter(result => result.passed).length}/${results.length} passed. Synthetic images and report: ${outputDirectory}`);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

main().catch(() => { console.error("Live AI verification could not start. No secrets or provider payloads are logged."); process.exitCode = 1; });
