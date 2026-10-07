"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfidenceBadge } from "./confidence-badge";
import { fieldLabels, reviewFieldOrder, type DraftExtraField, type StandardField } from "@/lib/cards/review";

export function ExtraFieldsEditor({ fields, prefix, errors, onEdit, onAdd, onRemove, onConvert }: {
  fields: DraftExtraField[];
  prefix: string;
  errors: Record<string, string>;
  onEdit: (id: string, change: Partial<Pick<DraftExtraField, "label" | "value">>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onConvert: (id: string, target: StandardField) => void;
}) {
  return <fieldset className="space-y-4 min-w-0">
    <legend className="mb-3 text-base font-semibold">Additional fields</legend>
    {fields.length === 0 && <p className="text-sm text-muted-foreground">No additional fields. Add one if needed.</p>}
    {fields.map((field, index) => <ExtraFieldRow key={field.id} {...{ field, index, prefix, errors, onEdit, onRemove, onConvert }} />)}
    <Button id={`${prefix}-add`} type="button" variant="outline" onClick={onAdd} disabled={fields.length >= 100} className="w-full sm:w-auto">Add field</Button>
  </fieldset>;
}

function ExtraFieldRow({ field, index, prefix, errors, onEdit, onRemove, onConvert }: {
  field: DraftExtraField; index: number; prefix: string; errors: Record<string, string>;
  onEdit: (id: string, change: Partial<Pick<DraftExtraField, "label" | "value">>) => void;
  onRemove: (id: string) => void; onConvert: (id: string, target: StandardField) => void;
}) {
  const [target, setTarget] = useState<StandardField>("name");
  const id = `${prefix}-${field.id}`;
  const unknown = !field.label.trim() || field.key.startsWith("unknown_field");
  const needsReview = unknown || (field.confidence !== null && field.confidence < 0.7);
  return <fieldset className={`min-w-0 space-y-3 rounded-xl border p-4 ${needsReview ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
    <legend className="px-1 text-sm font-medium">Additional field {index + 1}</legend>
    {unknown && <p id={`${id}-unknown`} className="text-sm font-medium">Unknown field — review its meaning or add a label.</p>}
    <ConfidenceBadge score={field.confidence} />
    <div className="grid gap-3 sm:grid-cols-2">
      {(["label", "value"] as const).map(part => {
        const error = errors[`extraFields.${index}.${part}`];
        return <div key={part} className="space-y-2 min-w-0">
          <Label htmlFor={`${id}-${part}`}>{part === "label" ? "Label" : "Value"} for additional field {index + 1}</Label>
          <Input id={`${id}-${part}`} value={field[part]} maxLength={2000} dir="auto" aria-invalid={!!error} aria-describedby={[unknown ? `${id}-unknown` : "", error ? `${id}-${part}-error` : ""].filter(Boolean).join(" ") || undefined} onChange={event => onEdit(field.id, { [part]: event.target.value })} />
          {error && <p id={`${id}-${part}-error`} className="text-sm text-destructive">{error}</p>}
        </div>;
      })}
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-target`}>Convert additional field {index + 1} to</Label>
      <select id={`${id}-target`} className="h-11 w-full rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring" value={target} onChange={event => setTarget(event.target.value as StandardField)}>
        {reviewFieldOrder.map(key => <option key={key} value={key}>{fieldLabels[key]}</option>)}
      </select>
    </div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button type="button" variant="outline" onClick={() => onConvert(field.id, target)}>Convert field {index + 1}</Button>
      <Button type="button" variant="destructive" onClick={() => onRemove(field.id)}>Remove field {index + 1}</Button>
    </div>
  </fieldset>;
}
