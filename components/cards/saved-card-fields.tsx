import { hasFieldValue } from "@/lib/cards/field-value";
import { fieldLabels, type StandardField } from "@/lib/cards/review";

export function SavedCardFields({ fields, extraFields, extraFieldsUnavailable = false }: {
  fields: { key: StandardField; value: string | null | undefined }[];
  extraFields: { key: string; label?: string | null; value?: string | null }[];
  extraFieldsUnavailable?: boolean;
}) {
  const populated = fields.filter(field => hasFieldValue(field.value));
  const extras = extraFields.filter(field => hasFieldValue(field.value));
  return <>
    {!populated.length && !extras.length && !extraFieldsUnavailable && <p className="rounded-lg border p-3 text-sm">No card information yet. Choose Edit to add fields manually.</p>}
    {populated.length > 0 && <dl className="grid gap-4 sm:grid-cols-2">
      {populated.map(field => <div key={field.key} className="min-w-0 rounded-lg border p-3">
        <dt className="text-sm text-muted-foreground">{fieldLabels[field.key]}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words" dir="auto">{field.value}</dd>
      </div>)}
    </dl>}
    {(extras.length > 0 || extraFieldsUnavailable) && <section aria-labelledby="saved-extra-heading" className="space-y-3">
      <h2 id="saved-extra-heading" className="text-lg font-semibold">Additional fields</h2>
      {extraFieldsUnavailable ? <p role="alert">Unable to display the additional fields.</p> : <dl className="grid gap-3 sm:grid-cols-2">
        {extras.map((field, index) => <div key={`${field.key}-${index}`} className="min-w-0 rounded-lg border p-3">
          <dt dir="auto" className="text-sm text-muted-foreground">{hasFieldValue(field.label) ? field.label : "Unknown field"}</dt>
          <dd dir="auto" className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd>
        </div>)}
      </dl>}
    </section>}
  </>;
}
