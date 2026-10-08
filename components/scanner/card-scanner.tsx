"use client";

import { ImageIcon, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePicker } from "@/components/scanner/image-picker";
import { ImagePreview } from "@/components/scanner/image-preview";
import { useCardScanner } from "@/components/scanner/use-card-scanner";
import { CardReviewForm } from "@/components/cards/card-review-form";
import { redirect } from "next/navigation";
import { useRef, useState } from "react";
import { DuplicateWarning } from "@/components/cards/duplicate-warning";
import { ScanSteps } from "./scan-steps";

export function CardScanner() {
  const { state, backImage, result, reviewedScan, duplicateWarning, cancelDuplicateSave, invalidateReview, selectImage, removeImage, extract, save } = useCardScanner();
  const [side, setSide] = useState<"front" | "back">("front");
  const preview = side === "front" ? state.image : backImage;
  const saveButton = useRef<HTMLButtonElement>(null);
  if (state.status === "completed") redirect(`/cards/${state.cardId}`);
  const extracting = state.status === "extracting";
  const saving = state.status === "saving";
  const saveLocked = saving;
  const busy = state.status === "validating" || extracting || saveLocked;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{result ? "Check card information" : state.image ? "Check your image" : "Select a card image"}</CardTitle>
        <p id="scan-file-help" className="text-sm text-muted-foreground">
          JPG, JPEG, PNG, or WEBP. Maximum 10 MB.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ScanSteps current={reviewedScan || saving || duplicateWarning ? 4 : result ? 3 : extracting ? 2 : state.image ? 1 : 0} />
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Card side">
          <Button type="button" variant={side === "front" ? "default" : "outline"} aria-pressed={side === "front"} onClick={() => setSide("front")}>Front (required)</Button>
          <Button type="button" variant={side === "back" ? "default" : "outline"} aria-pressed={side === "back"} onClick={() => setSide("back")}>Back (optional)</Button>
        </div>
        <p className="text-sm text-muted-foreground">Add the front of your card. Add the back if it has more information. Both sides will be read together.</p>
        <div
          className="flex flex-col gap-3 sm:flex-row"
          aria-describedby="scan-file-help"
        >
          <ImagePicker
            mode="camera"
            hasImage={!!preview}
            side={side === "back" ? "back" : undefined}
            disabled={busy}
            onSelect={file => { void selectImage(file, side); }}
          />
          <ImagePicker
            mode="upload"
            hasImage={!!preview}
            side={side === "back" ? "back" : undefined}
            disabled={busy}
            onSelect={file => { void selectImage(file, side); }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          On supported phones, Take photo opens your camera. If a camera is
          unavailable, choose an existing image.
        </p>
        <div
          className="flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {busy ? (
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : state.image ? (
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          ) : null}
          {status}
        </div>
        <div aria-busy={busy}>
          <p className="mb-3 text-sm font-semibold">{side === "front" ? "Front preview" : "Back preview"}</p>
          {preview ? (
            <ImagePreview image={preview} />
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-5 text-center sm:min-h-72">
              <ImageIcon
                className="size-9 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-medium">Your {side} image preview will appear here</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Keep the whole card in frame, use good lighting, and make sure
                the text is sharp.
              </p>
            </div>
          )}
        </div>
        {(state.status === "error" || state.status === "extraction_error" || state.status === "save_error") && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            {state.message}
          </p>
        )}
        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={saveLocked || (!preview && !busy)}
            onClick={() => removeImage(side)}
          >
            {extracting
              ? "Cancel extraction and remove image"
              : busy && !state.image
                ? "Cancel selection"
                : side === "back" ? "Remove back image" : "Remove image"}
          </Button>
          <Button
            type="button"
            variant={result ? "outline" : "default"}
            loading={extracting}
            className="w-full sm:w-auto"
            disabled={!state.image || busy}
            onClick={extract}
          >
            {extracting
              ? "Analyzing card…"
              : state.status === "extraction_error"
                ? "Retry extraction"
                : result
                  ? "Extract again"
                  : "Extract information"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Extract sends your image to the AI provider to read the card. Check every value before saving.
          Your original image stays with your review.
        </p>
        {(result?.hasSideConflicts || result?.conflictingFields?.length) ? <p role="alert" className="rounded-lg border border-amber-500 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">Some fields differ between the front and back. Both values are kept in Additional fields with side labels. Check them before saving.</p> : null}
        {result && <CardReviewForm extraction={result} disabled={busy} loading={saving} submitDisabled={!!duplicateWarning} submitRef={saveButton} onConfirm={data => { void save(false, data); }} onChange={invalidateReview} />}
        {duplicateWarning && <DuplicateWarning warning={duplicateWarning} disabled={busy} onSaveAnyway={() => { void save(true); }} onCancel={() => { cancelDuplicateSave(); queueMicrotask(() => saveButton.current?.focus()); }} />}
        {(state.status === "save_error" || state.status === "extraction_error") && state.message.includes("session has expired") && <a className="inline-block rounded py-3 underline focus-visible:outline-2" href="/login?next=%2Fscan" target="_blank" rel="noopener noreferrer">Sign in in a new tab to keep your draft</a>}
      </CardContent>
    </Card>
  );
}
