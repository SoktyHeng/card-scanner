"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractedCard } from "@/lib/ai/types";
import {
  addExtraField, convertExtraField, createReviewDraft, editExtraField, editStandardField,
  fieldLabels, removeExtraField, reviewFieldOrder, validateReviewDraft,
  type ReviewDraft, type ReviewedCard, type StandardField,
} from "@/lib/cards/review";
import { hasFieldValue } from "@/lib/cards/field-value";
import { ConfidenceBadge } from "./confidence-badge";
import { ExtraFieldsEditor } from "./extra-fields-editor";

export function CardReviewForm({ extraction, initialData, rawText, editing = false, confirmed, disabled = false, onConfirm, onChange }: {
  extraction?: ExtractedCard;
  initialData?: ReviewedCard;
  editing?: boolean;
  rawText?: string | null;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: (data: ReviewedCard) => void;
  onChange: () => void;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState(() => {
    const source = initialData ?? extraction;
    if (!source) throw new Error("Review data is required");
    return createReviewDraft(source);
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visibleStandard, setVisibleStandard] = useState(() => new Set(reviewFieldOrder.filter(key => hasFieldValue(draft.fields[key]))));
  const [visibleExtras, setVisibleExtras] = useState(() => new Set(draft.extraFields.filter(field => hasFieldValue(field.value)).map(field => field.id)));
  const [fieldToAdd, setFieldToAdd] = useState("custom");
  const [message, setMessage] = useState<string | null>(null);
  const nextId = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  function change(next: ReviewDraft) {
    setDraft(next);
    setErrors({});
    setMessage(null);
    onChange();
  }
  function focus(id: string) {
    queueMicrotask(() => document.getElementById(id)?.focus());
  }
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateReviewDraft(draft);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => { nextErrors[issue.path.join(".")] = issue.message; });
      // Validation must never leave an invalid field hidden and uncorrectable.
      setVisibleStandard(current => new Set([...current, ...reviewFieldOrder.filter(key => nextErrors[key] || nextErrors[`fieldConfidences.${key}`])]));
      setVisibleExtras(current => new Set([...current, ...draft.extraFields.filter((_, index) => Object.keys(nextErrors).some(path => path.startsWith(`extraFields.${index}.`))).map(field => field.id)]));
      setErrors(nextErrors);
      setMessage("Check the highlighted fields before confirming.");
      queueMicrotask(() => alert.current?.focus());
      return;
    }
    setErrors({});
    setMessage(null);
    onConfirm(result.data);
  }
  const empty = !reviewFieldOrder.some(key => hasFieldValue(draft.fields[key])) && !draft.extraFields.some(field => hasFieldValue(field.value));
  const sourceText = rawText ?? extraction?.rawText;
  const hiddenStandard = reviewFieldOrder.filter(key => !visibleStandard.has(key));
  const hiddenExtras = draft.extraFields.filter(field => !visibleExtras.has(field.id));
  function addField() {
    if (fieldToAdd.startsWith("standard:")) {
      const key = fieldToAdd.slice(9) as StandardField;
      setVisibleStandard(current => new Set([...current, key]));
      focus(`${prefix}-${key}`);
    } else if (fieldToAdd.startsWith("extra:")) {
      const id = fieldToAdd.slice(6);
      setVisibleExtras(current => new Set([...current, id]));
      focus(`${prefix}-${id}-value`);
    } else {
      const id = `manual-${nextId.current++}`;
      change(addExtraField(draft, id));
      setVisibleExtras(current => new Set([...current, id]));
      focus(`${prefix}-${id}-label`);
    }
    setFieldToAdd("custom");
  }

  return <section aria-labelledby={`${prefix}-heading`} className="space-y-4 border-t pt-5">
    <h2 id={`${prefix}-heading`} tabIndex={-1} ref={heading} className="rounded text-xl font-semibold focus-visible:outline-2">{editing ? "Edit card information" : "Review card information"}</h2>
    <p className="text-sm text-muted-foreground">Compare each value with the image above. Correct mistakes or leave missing information blank.</p>
    {empty && <p role="status" className="rounded-lg border p-3 text-sm">{editing ? "This card has no populated fields." : "No readable fields were found."} Use Add field to enter information manually.</p>}
    {extraction?.overallConfidence != null && <div className="space-y-1">
      <p className="text-sm">Original extraction overall confidence</p>
      <ConfidenceBadge score={extraction?.overallConfidence} />
      <p className="text-xs text-muted-foreground">AI scores describe extracted values. Edited and manually added values have no AI score.</p>
    </div>}
    <form noValidate onSubmit={confirm} className="space-y-6">
      {message && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive focus-visible:outline-2">
        <p>{message}</p>
        {Object.entries(errors).map(([path, error]) => <p key={path}>{fieldLabels[path as keyof typeof fieldLabels] ?? "Additional field"}: {error}</p>)}
      </div>}
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        {visibleStandard.size > 0 && <fieldset className="min-w-0">
          <legend className="mb-4 font-semibold">Standard fields</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {reviewFieldOrder.filter(key => visibleStandard.has(key)).map(key => {
              const id = `${prefix}-${key}`;
              const score = draft.fieldConfidences[key];
              return <div key={key} className={`min-w-0 space-y-2 rounded-lg border p-3 ${score !== null && score < 0.7 ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                <Label htmlFor={id}>{fieldLabels[key]}</Label>
                {key === "address" ? <textarea id={id} rows={3} value={draft.fields[key]} dir="auto" maxLength={2000} aria-invalid={!!errors[key]} aria-describedby={`${id}-help`} onChange={event => change(editStandardField(draft, key, event.target.value))} className="w-full min-w-0 rounded-lg border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive" /> :
                  <Input id={id} value={draft.fields[key]} dir="auto" maxLength={2000} inputMode={key === "email" ? "email" : key === "phone" || key === "secondaryPhone" ? "tel" : key === "website" ? "url" : "text"} aria-invalid={!!errors[key]} aria-describedby={`${id}-help`} onChange={event => change(editStandardField(draft, key, event.target.value))} />}
                <div id={`${id}-help`} className="space-y-1">
                  <ConfidenceBadge score={score} />
                  {errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}
                </div>
              </div>;
            })}
          </div>
        </fieldset>}
        {draft.extraFields.some(field => visibleExtras.has(field.id)) && <ExtraFieldsEditor fields={draft.extraFields} visibleIds={visibleExtras} prefix={prefix} errors={errors}
          onEdit={(id, value) => change(editExtraField(draft, id, value))}
          onRemove={id => {
            change(removeExtraField(draft, id));
            focus(`${prefix}-add`);
          }}
          onConvert={(id, target) => {
            const conversion = convertExtraField(draft, id, target);
            if (conversion.error) {
              setMessage(conversion.error);
              queueMicrotask(() => alert.current?.focus());
            } else {
              setVisibleStandard(current => new Set([...current, target]));
              change(conversion.draft);
              focus(`${prefix}-${target}`);
            }
          }} />}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 space-y-2 sm:flex-1">
            <Label htmlFor={`${prefix}-field-choice`}>Field to add</Label>
            <select id={`${prefix}-field-choice`} value={fieldToAdd} onChange={event => setFieldToAdd(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring">
              {hiddenStandard.map(key => <option key={key} value={`standard:${key}`}>{fieldLabels[key]}</option>)}
              {hiddenExtras.map(field => <option key={field.id} value={`extra:${field.id}`}>{hasFieldValue(field.label) ? field.label : "Unlabeled additional field"} (empty)</option>)}
              <option value="custom" disabled={draft.extraFields.length >= 100}>Custom field</option>
            </select>
          </div>
          <Button id={`${prefix}-add`} type="button" variant="outline" onClick={addField} disabled={fieldToAdd === "custom" && draft.extraFields.length >= 100}>Add field</Button>
        </div>
        <Button type="submit" className="w-full sm:w-auto">{editing ? "Save changes" : "Confirm reviewed information"}</Button>
      </fieldset>
    </form>
    {!disabled && !editing && <p role="status" aria-live="polite" aria-atomic="true" className="rounded-lg border p-3 text-sm">
      {confirmed ? "Review confirmed. Nothing has been saved. You can keep editing; changes require confirmation again." : "Nothing has been saved. Confirm after checking all values, including low-confidence and unknown fields."}
    </p>}
    {hasFieldValue(sourceText) && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer rounded focus-visible:outline-2">Original source text</summary>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm" dir="auto">{sourceText}</p>
    </details>}
    <p className="text-xs text-muted-foreground">{editing ? "Saving changes preserves the original image, source text, and AI extraction. Unsaved edits are cleared when you leave this page." : "The original image and AI results stay separate from your corrections. This review remains on this page only and is cleared when you replace or remove the image, extract again, or leave."}</p>
  </section>;
}
