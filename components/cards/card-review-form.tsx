"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractedCard } from "@/lib/ai/types";
import {
  addExtraField, convertExtraField, createReviewDraft, editExtraField, editStandardField,
  fieldLabels, removeExtraField, reviewFieldOrder, validateReviewDraft,
  type ReviewDraft, type ReviewedCard,
} from "@/lib/cards/review";
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
      setErrors(nextErrors);
      setMessage("Check the highlighted fields before confirming.");
      queueMicrotask(() => alert.current?.focus());
      return;
    }
    setErrors({});
    setMessage(null);
    onConfirm(result.data);
  }
  const empty = extraction && reviewFieldOrder.every(key => extraction[key] === null) && extraction.extraFields.length === 0;

  return <section aria-labelledby={`${prefix}-heading`} className="space-y-4 border-t pt-5">
    <h2 id={`${prefix}-heading`} tabIndex={-1} ref={heading} className="rounded text-xl font-semibold focus-visible:outline-2">{editing ? "Edit card information" : "Review card information"}</h2>
    <p className="text-sm text-muted-foreground">Compare each value with the image above. Correct mistakes or leave missing information blank.</p>
    {empty && !editing && <p role="status" className="rounded-lg border p-3 text-sm">No readable fields were found. Enter information manually or try a clearer photo and extract again.</p>}
    <div className="space-y-1">
      <p className="text-sm">Original extraction overall confidence</p>
      <ConfidenceBadge score={extraction?.overallConfidence} />
      <p className="text-xs text-muted-foreground">AI scores describe extracted values. Edited and manually added values have no AI score.</p>
    </div>
    <form noValidate onSubmit={confirm} className="space-y-6">
      {message && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive focus-visible:outline-2">
        <p>{message}</p>
        {Object.entries(errors).map(([path, error]) => <p key={path}>{fieldLabels[path as keyof typeof fieldLabels] ?? "Additional field"}: {error}</p>)}
      </div>}
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        <fieldset className="min-w-0">
          <legend className="mb-4 font-semibold">Standard fields</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {reviewFieldOrder.map(key => {
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
        </fieldset>
        <ExtraFieldsEditor fields={draft.extraFields} prefix={prefix} errors={errors}
          onEdit={(id, value) => change(editExtraField(draft, id, value))}
          onAdd={() => {
            const id = `manual-${nextId.current++}`;
            change(addExtraField(draft, id));
            focus(`${prefix}-${id}-label`);
          }}
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
              change(conversion.draft);
              focus(`${prefix}-${target}`);
            }
          }} />
        <Button type="submit" className="w-full sm:w-auto">{editing ? "Save changes" : "Confirm reviewed information"}</Button>
      </fieldset>
    </form>
    {!disabled && !editing && <p role="status" aria-live="polite" aria-atomic="true" className="rounded-lg border p-3 text-sm">
      {confirmed ? "Review confirmed. Nothing has been saved. You can keep editing; changes require confirmation again." : "Nothing has been saved. Confirm after checking all values, including low-confidence and unknown fields."}
    </p>}
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer rounded focus-visible:outline-2">Original source text</summary>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm" dir="auto">{rawText ?? extraction?.rawText ?? "No source text was extracted."}</p>
    </details>
    <p className="text-xs text-muted-foreground">{editing ? "Saving changes preserves the original image, source text, and AI extraction. Unsaved edits are cleared when you leave this page." : "The original image and AI results stay separate from your corrections. This review remains on this page only and is cleared when you replace or remove the image, extract again, or leave."}</p>
  </section>;
}
