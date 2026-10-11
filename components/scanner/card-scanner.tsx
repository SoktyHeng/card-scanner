"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import { ImageIcon, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePicker } from "@/components/scanner/image-picker";
import { ImagePreview } from "@/components/scanner/image-preview";
import { useCardScanner } from "@/components/scanner/use-card-scanner";
import { CardReviewForm } from "@/components/cards/card-review-form";
import { redirect } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { DuplicateWarning } from "@/components/cards/duplicate-warning";
import { createReviewDraft } from "@/lib/cards/review";
import { useDraftRecovery } from "./use-draft-recovery";
import { ScanSteps } from "./scan-steps";
export function CardScanner({ owner }: {
    owner?: string;
} = {}) {
    const { date, t } = useLanguage();
    const { state, backImage, result, reviewDraft, reviewGeneration, restoreScan, reviewedScan, duplicateWarning, cancelDuplicateSave, invalidateReview, selectImage, removeImage, extract, save } = useCardScanner();
    const [side, setSide] = useState<"front" | "back">("front");
    const preview = side === "front" ? state.image : backImage;
    const saveButton = useRef<HTMLButtonElement>(null);
    const snapshot = useMemo(() => ({ front: state.image?.file ?? null, back: backImage?.file ?? null, payload: {
            extraction: result, review: reviewDraft ?? (result ? createReviewDraft(result) : null),
            frontName: state.image?.file.name.slice(0, 255) ?? null, backName: backImage?.file.name.slice(0, 255) ?? null,
        } }), [state.image, backImage, result, reviewDraft]);
    const recovery = useDraftRecovery(snapshot, restoreScan, ["validating", "extracting", "saving", "completed"].includes(state.status), owner);
    if (state.status === "completed")
        redirect(`/cards/${state.cardId}`);
    const extracting = state.status === "extracting";
    const saving = state.status === "saving";
    const saveLocked = saving;
    const busy = state.status === "validating" || extracting || saveLocked || recovery.working;
    const status = saving ? "Saving card…" : extracting
        ? "Analyzing card…"
        : state.status === "duplicates" ? "Possible duplicate found"
            : busy
                ? "Checking image…"
                : state.status === "reviewed"
                    ? "Ready to save"
                    : state.status === "review"
                        ? "Ready for review"
                        : state.image
                            ? "Image selected"
                            : backImage ? "Add a front image to continue" : "No image selected";
    return (<Card>
      <CardHeader>
        <CardTitle>{result ? <T text={"Check card information"}/> : state.image ? <T text={"Check your image"}/> : <T text={"Select a card image"}/>}</CardTitle>
        <p id="scan-file-help" className="text-sm text-muted-foreground"><T text={"JPG, JPEG, PNG, or WEBP. Maximum 10 MB."}/></p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label={t("Draft recovery")} className="space-y-3 rounded-lg border p-4">
          <p className="font-semibold"><T text={"Draft recovery"}/></p>
          <p className="text-sm text-muted-foreground"><T text={"Opt in to keep images and review edits privately for 24 hours from draft creation. Wait for Recovery saved before leaving. A recovered card still needs your review and confirmation."}/></p>
          <p role="status" aria-live="polite" className="text-sm">{<T text={recovery.status}/>}</p>
          {recovery.meta && <p className="text-xs text-muted-foreground"><T text="Expires {date} (Cambodia time)" parameters={{date: date(recovery.meta.expiresAt, {dateStyle: "medium", timeStyle: "short"})}}/></p>}
          <div className="flex flex-wrap gap-2">
            {!recovery.enabled ? <Button type="button" variant="outline" disabled={busy || (!state.image && !backImage)} onClick={recovery.enable}><T text={"Keep a recovery draft"}/></Button> : <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => { void recovery.saveNow(); }}><T text={"Save draft now"}/></Button>
              {recovery.meta && <Button type="button" variant="outline" disabled={busy} onClick={() => { void recovery.discard(recovery.meta!.id, recovery.meta!.revision); }}><T text={"Discard recovery copy"}/></Button>}
            </>}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { void recovery.refresh(); }}><T text={"Refresh recovery list"}/></Button>
          </div>
          {recovery.error && <p role="alert" className="text-sm text-destructive">{<T text={recovery.error}/>}</p>}
          {recovery.error?.includes("session has expired") && <a href="/login?next=%2Fscan" target="_blank" rel="noopener noreferrer" className="underline"><T text={"Sign in in a new tab"}/></a>}
          {recovery.savedCardId && <a href={`/cards/${recovery.savedCardId}`} className="underline"><T text={"Open the already saved card"}/></a>}
          {recovery.drafts.length > 0 && <ul className="space-y-2">{recovery.drafts.map(draft => <li key={draft.id} className="flex flex-wrap items-center gap-2 border-t pt-2">
            <span className="min-w-0 break-words text-sm" dir="auto">{draft.label}{draft.saving ? <T text={" (save pending)"}/> : ""}</span>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { void recovery.resume(draft.id); }}><T text={"Resume draft"}/></Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { void recovery.discard(draft.id, draft.revision); }}><T text={"Discard draft"}/></Button>
          </li>)}</ul>}
        </section>
        <ScanSteps current={reviewedScan || saving || duplicateWarning ? 4 : result ? 3 : extracting ? 2 : state.image ? 1 : 0}/>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("Card side")}>
          <Button type="button" variant={side === "front" ? "default" : "outline"} aria-pressed={side === "front"} onClick={() => setSide("front")}><T text={"Front (required)"}/></Button>
          <Button type="button" variant={side === "back" ? "default" : "outline"} aria-pressed={side === "back"} onClick={() => setSide("back")}><T text={"Back (optional)"}/></Button>
        </div>
        <p className="text-sm text-muted-foreground"><T text={"Add the front of your card. Add the back if it has more information. Both sides will be read together."}/></p>
        <div className="flex flex-col gap-3 sm:flex-row" aria-describedby="scan-file-help">
          <ImagePicker mode="camera" hasImage={!!preview} side={side === "back" ? "back" : undefined} disabled={busy} onSelect={file => { void selectImage(file, side); }}/>
          <ImagePicker mode="upload" hasImage={!!preview} side={side === "back" ? "back" : undefined} disabled={busy} onSelect={file => { void selectImage(file, side); }}/>
        </div>
        <p className="text-sm text-muted-foreground"><T text={"On supported phones, Take photo opens your camera. If a camera is unavailable, choose an existing image."}/></p>
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite" aria-atomic="true">
          {busy ? (<LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/>) : state.image ? (<CheckCircle2 className="size-4 text-primary" aria-hidden="true"/>) : null}
          {<T text={status}/>}
        </div>
        <div aria-busy={busy}>
          <p className="mb-3 text-sm font-semibold">{side === "front" ? <T text={"Front preview"}/> : <T text={"Back preview"}/>}</p>
          {preview ? (<ImagePreview image={preview}/>) : (<div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-5 text-center sm:min-h-72">
              <ImageIcon className="size-9 text-muted-foreground" aria-hidden="true"/>
              <p className="font-medium"><T text="Your {side} image preview will appear here" parameters={{side: t(side === "front" ? "Front" : "Back")}}/></p>
              <p className="max-w-sm text-sm text-muted-foreground"><T text={"Keep the whole card in frame, use good lighting, and make sure the text is sharp."}/></p>
            </div>)}
        </div>
        {(state.status === "error" || state.status === "extraction_error" || state.status === "save_error") && (<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
            {<T text={state.message}/>}
          </p>)}
        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={saveLocked || (!preview && !busy)} onClick={() => removeImage(side)}>
            {extracting
            ? <T text={"Cancel extraction and remove image"}/> : busy && !state.image
            ? <T text={"Cancel selection"}/> : side === "back" ? <T text={"Remove back image"}/> : <T text={"Remove image"}/>}
          </Button>
          <Button type="button" variant={result ? "outline" : "default"} loading={extracting} className="w-full sm:w-auto" disabled={!state.image || busy} onClick={extract}>
            {extracting
            ? <T text={"Analyzing card…"}/> : state.status === "extraction_error"
            ? <T text={"Retry extraction"}/> : result
            ? <T text={"Extract again"}/> : <T text={"Extract information"}/>}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground"><T text={"Extract sends your image to the AI provider to read the card. Check every value before saving. Your original image stays with your review."}/></p>
        {(result?.hasSideConflicts || result?.conflictingFields?.length) ? <p role="alert" className="rounded-lg border border-amber-500 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20"><T text={"Some fields differ between the front and back. Both values are kept in Additional fields with side labels. Check them before saving."}/></p> : null}
        {result && <CardReviewForm key={reviewGeneration} initialDraft={reviewDraft ?? undefined} recoveryEnabled={recovery.enabled} extraction={result} disabled={busy} loading={saving} submitDisabled={!!duplicateWarning} submitRef={saveButton} onConfirm={data => { void save(false, data, recovery.enabled ? recovery.save : undefined); }} onChange={invalidateReview}/>}
        {duplicateWarning && <DuplicateWarning warning={duplicateWarning} disabled={busy} onSaveAnyway={() => { void save(true, undefined, recovery.enabled ? recovery.save : undefined); }} onCancel={() => { cancelDuplicateSave(); queueMicrotask(() => saveButton.current?.focus()); }}/>}
        {(state.status === "save_error" || state.status === "extraction_error") && state.message.includes("session has expired") && <a className="inline-block rounded py-3 underline focus-visible:outline-2" href="/login?next=%2Fscan" target="_blank" rel="noopener noreferrer"><T text={"Sign in in a new tab to keep your draft"}/></a>}
      </CardContent>
    </Card>);
}
