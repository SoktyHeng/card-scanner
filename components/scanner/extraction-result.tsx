import { standardFields } from "@/lib/ai/card-schema";
import type { ExtractedCard } from "@/lib/ai/types";

const labels: Record<(typeof standardFields)[number], string> = {
  cardType: "Card type",
  name: "Name",
  company: "Company",
  jobTitle: "Job title",
  department: "Department",
  email: "Email",
  phone: "Phone",
  secondaryPhone: "Secondary phone",
  website: "Website",
  address: "Address",
  cardNumber: "Card number",
};

function confidenceText(score: number) {
  return `${Math.round(score * 100)}% confidence${score < 0.7 ? " — needs review" : ""}`;
}

// Read-only extraction output. Editing/review and saving belong to later phases.
export function ExtractionResult({ data }: { data: ExtractedCard }) {
  const hasFields =
    standardFields.some((key) => data[key] !== null) ||
    data.extraFields.length > 0;
  return (
    <section
      aria-labelledby="extraction-result-title"
      className="space-y-4 border-t pt-5"
    >
      <h2 id="extraction-result-title" className="text-lg font-semibold">
        Extracted information
      </h2>
      <p role="status" className="text-sm text-muted-foreground">
        {hasFields
          ? "Check these values carefully. Review editing and saving will be available in a later phase."
          : "No readable fields were found. Try a clearer photo and extract again."}
      </p>
      <p className="text-sm">
        Overall: {confidenceText(data.overallConfidence)}
      </p>
      {hasFields && (
        <dl className="grid gap-4 sm:grid-cols-2">
          {standardFields.map((key) =>
            data[key] === null ? null : (
              <div key={key} className="min-w-0 rounded-lg border p-3">
                <dt className="text-sm font-medium">{labels[key]}</dt>
                <dd className="whitespace-pre-wrap break-words">{data[key]}</dd>
                <dd className="text-xs text-muted-foreground">
                  {confidenceText(data.fieldConfidences[key]!)}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      {data.extraFields.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">Additional fields</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            {data.extraFields.map((field, index) => (
              <div
                key={`${field.key}-${index}`}
                className="min-w-0 rounded-lg border p-3"
              >
                <dt className="text-sm font-medium">
                  {field.label ?? "Unknown field — needs review"}
                </dt>
                <dd className="whitespace-pre-wrap break-words">
                  {field.value}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {confidenceText(field.confidence)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {data.rawText !== null && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer rounded focus-visible:outline-2">
            Source text
          </summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {data.rawText}
          </p>
        </details>
      )}
      <p className="text-sm text-muted-foreground">
        Nothing has been saved. Results stay on this page and are cleared when
        you replace/remove the image or leave.
      </p>
    </section>
  );
}
