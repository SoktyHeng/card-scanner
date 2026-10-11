"use client";
import { T } from "@/components/i18n/language-provider";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractedCard } from "@/lib/ai/types";
import { addExtraField, convertExtraField, createReviewDraft, editExtraField, editStandardField, fieldLabels, removeExtraField, reviewFieldOrder, validateReviewDraft, type ReviewDraft, type ReviewedCard, type StandardField, } from "@/lib/cards/review";
import { hasFieldValue } from "@/lib/cards/field-value";
import { ConfidenceBadge } from "./confidence-badge";
import { ExtraFieldsEditor } from "./extra-fields-editor";
export function CardReviewForm({ extraction, initialData, initialDraft, recoveryEnabled = false, rawText, editing = false, disabled = false, loading = false, submitDisabled = false, submitRef, onConfirm, onChange }: {
    extraction?: ExtractedCard;
    initialData?: ReviewedCard;
    initialDraft?: ReviewDraft;
    recoveryEnabled?: boolean;
    editing?: boolean;
    rawText?: string | null;
    confirmed?: boolean;
    disabled?: boolean;
    loading?: boolean;
    submitDisabled?: boolean;
    submitRef?: React.RefObject<HTMLButtonElement | null>;
    onConfirm: (data: ReviewedCard) => void;
    onChange: (draft: ReviewDraft) => void;
}) {
    const prefix = useId();
    const [draft, setDraft] = useState(() => {
        if (initialDraft)
            return initialDraft;
        const source = initialData ?? extraction;
        if (!source)
            throw new Error("Review data is required");
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
    const saveDialog = useRef<HTMLDialogElement>(null);
    const localSubmitRef = useRef<HTMLButtonElement>(null);
    const saveTrigger = submitRef ?? localSubmitRef;
    const pendingReview = useRef<ReviewedCard | null>(null);
    const restoreSaveFocus = useRef(true);
    useEffect(() => { heading.current?.focus(); }, []);
    function change(next: ReviewDraft) {
        pendingReview.current = null;
        if (saveDialog.current?.open)
            saveDialog.current.close();
        setDraft(next);
        setErrors({});
        setMessage(null);
        onChange(next);
    }
    function focus(id: string) {
        queueMicrotask(() => document.getElementById(id)?.focus());
    }
    function confirm(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (disabled || submitDisabled || saveDialog.current?.open)
            return;
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
        if (editing)
            onConfirm(result.data);
        else {
            pendingReview.current = result.data;
            restoreSaveFocus.current = true;
            saveDialog.current?.showModal();
        }
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
        }
        else if (fieldToAdd.startsWith("extra:")) {
            const id = fieldToAdd.slice(6);
            setVisibleExtras(current => new Set([...current, id]));
            focus(`${prefix}-${id}-value`);
        }
        else {
            let id: string;
            do {
                id = `manual-${nextId.current++}`;
            } while (draft.extraFields.some(field => field.id === id));
            change(addExtraField(draft, id));
            setVisibleExtras(current => new Set([...current, id]));
            focus(`${prefix}-${id}-label`);
        }
        setFieldToAdd("custom");
    }
    return <section aria-labelledby={`${prefix}-heading`} className="space-y-4 border-t pt-5">
    <h2 id={`${prefix}-heading`} tabIndex={-1} ref={heading} className="rounded text-xl font-semibold focus-visible:outline-2">{editing ? <T text={"Edit card information"}/> : <T text={"Review card information"}/>}</h2>
    <p className="text-sm text-muted-foreground"><T text={"Compare each value with the image above. Correct mistakes or leave missing information blank."}/></p>
    {empty && <p role="status" className="rounded-lg border p-3 text-sm">{editing ? <T text={"This card has no populated fields."}/> : <T text={"No readable fields were found."}/>}<T text={" Use Add field to enter information manually."}/></p>}
    {extraction?.overallConfidence != null && <div className="space-y-1">
      <p className="text-sm">{extraction.sourceSides ? <T text={"Lowest side extraction confidence"}/> : <T text={"Original extraction overall confidence"}/>}</p>
      <ConfidenceBadge score={extraction?.overallConfidence}/>
      <p className="text-xs text-muted-foreground"><T text={"AI scores describe extracted values. Edited and manually added values have no AI score."}/></p>
    </div>}
    <form noValidate onSubmit={confirm} className="space-y-6">
      {message && <div ref={alert} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive focus-visible:outline-2">
        <p>{<T text={message}/>}</p>
        {Object.entries(errors).map(([path, error]) => <p key={path}>{fieldLabels[path as keyof typeof fieldLabels] ?? "Additional field"}<T text={": "}/>{<T text={error}/>}</p>)}
      </div>}
      <fieldset disabled={disabled} className="min-w-0 space-y-6">
        {visibleStandard.size > 0 && <fieldset className="min-w-0">
          <legend className="mb-4 font-semibold"><T text={"Standard fields"}/></legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {reviewFieldOrder.filter(key => visibleStandard.has(key)).map(key => {
                const id = `${prefix}-${key}`;
                const score = draft.fieldConfidences[key];
                return <div key={key} className={`min-w-0 space-y-2 rounded-lg border p-3 ${score !== null && score < 0.7 ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                <Label htmlFor={id}>{<T text={fieldLabels[key]}/>}</Label>
                {key === "address" ? <textarea id={id} rows={3} value={draft.fields[key]} dir="auto" maxLength={2000} aria-invalid={!!errors[key]} aria-describedby={`${id}-help`} onChange={event => change(editStandardField(draft, key, event.target.value))} className="w-full min-w-0 rounded-lg border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive"/> :
                        <Input id={id} value={draft.fields[key]} dir="auto" maxLength={2000} inputMode={key === "email" ? "email" : key === "phone" || key === "secondaryPhone" ? "tel" : key === "website" ? "url" : "text"} aria-invalid={!!errors[key]} aria-describedby={`${id}-help`} onChange={event => change(editStandardField(draft, key, event.target.value))}/>}
                <div id={`${id}-help`} className="space-y-1">
                  <ConfidenceBadge score={score}/>
                  {errors[key] && <p className="text-sm text-destructive"><T text={errors[key]}/></p>}
                </div>
              </div>;
            })}
          </div>
        </fieldset>}
        {draft.extraFields.some(field => visibleExtras.has(field.id)) && <ExtraFieldsEditor fields={draft.extraFields} visibleIds={visibleExtras} prefix={prefix} errors={errors} onEdit={(id, value) => change(editExtraField(draft, id, value))} onRemove={id => {
                change(removeExtraField(draft, id));
                focus(`${prefix}-add`);
            }} onConvert={(id, target) => {
                const conversion = convertExtraField(draft, id, target);
                if (conversion.error) {
                    setMessage(conversion.error);
                    queueMicrotask(() => alert.current?.focus());
                }
                else {
                    setVisibleStandard(current => new Set([...current, target]));
                    change(conversion.draft);
                    focus(`${prefix}-${target}`);
                }
            }}/>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 space-y-2 sm:flex-1">
            <Label htmlFor={`${prefix}-field-choice`}><T text={"Field to add"}/></Label>
            <select id={`${prefix}-field-choice`} value={fieldToAdd} onChange={event => setFieldToAdd(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring">
              {hiddenStandard.map(key => <option key={key} value={`standard:${key}`}>{<T text={fieldLabels[key]}/>}</option>)}
              {hiddenExtras.map(field => <option key={field.id} value={`extra:${field.id}`}>{hasFieldValue(field.label) ? field.label : <T text={"Unlabeled additional field"}/>}<T text={" (empty)"}/></option>)}
              <option value="custom" disabled={draft.extraFields.length >= 100}><T text={"Custom field"}/></option>
            </select>
          </div>
          <Button id={`${prefix}-add`} type="button" variant="outline" onClick={addField} disabled={fieldToAdd === "custom" && draft.extraFields.length >= 100}><T text={"Add field"}/></Button>
        </div>
        <Button ref={saveTrigger} type="submit" className="w-full sm:w-auto" disabled={submitDisabled} loading={loading || (editing && disabled)}>{editing ? disabled ? <T text={"Saving changes…"}/> : <T text={"Save changes"}/> : loading ? <T text={"Saving card…"}/> : <T text={"Save card"}/>}</Button>
      </fieldset>
    </form>
    {!disabled && !editing && <p className="rounded-lg border p-3 text-sm">
      {recoveryEnabled ? <T text={"Recovery is enabled. This draft is separate from your card collection."}/> : <T text={"Nothing has been saved."}/>}<T text={"Check the values, then choose Save card."}/></p>}
    {!editing && <dialog ref={saveDialog} aria-labelledby={`${prefix}-save-title`} aria-describedby={`${prefix}-save-description`} onClose={() => { pendingReview.current = null; if (restoreSaveFocus.current)
            saveTrigger.current?.focus(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
      <h2 id={`${prefix}-save-title`} className="text-xl font-semibold"><T text={"Save this card?"}/></h2>
      <p id={`${prefix}-save-description`} className="my-4 text-sm leading-relaxed"><T text={"Confirm that you have checked the information. The card and original image will be saved to your private collection."}/></p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" autoFocus variant="outline" onClick={() => { pendingReview.current = null; saveDialog.current?.close(); }}><T text={"Cancel"}/></Button>
        <Button type="button" onClick={() => {
                const data = pendingReview.current;
                if (!data || disabled || submitDisabled)
                    return;
                pendingReview.current = null;
                restoreSaveFocus.current = false;
                saveDialog.current?.close();
                onConfirm(data);
            }}><T text={"Confirm"}/></Button>
      </div>
    </dialog>}
    {hasFieldValue(sourceText) && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer rounded focus-visible:outline-2"><T text={"Original source text"}/></summary>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm" dir="auto">{sourceText}</p>
    </details>}
    <p className="text-xs text-muted-foreground">{editing ? <T text={"Saving changes preserves the original image, source text, and AI extraction. Unsaved edits are cleared when you leave this page."}/> : recoveryEnabled ? <T text={"Wait for Recovery saved before leaving. A resumed draft must be reviewed again before saving a card."}/> : <T text={"The original image and AI results stay separate from your corrections. This review remains on this page only and is cleared when you replace or remove the image, extract again, or leave."}/>}</p>
  </section>;
}
