"use client";

import { ImageIcon, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePicker } from "@/components/scanner/image-picker";
import { ImagePreview } from "@/components/scanner/image-preview";
import { useCardScanner } from "@/components/scanner/use-card-scanner";
import { CardReviewForm } from "@/components/cards/card-review-form";
import { redirect } from "next/navigation";

export function CardScanner() {
  const { state, result, reviewedScan, confirmReview, invalidateReview, selectImage, removeImage, extract, save } = useCardScanner();
  if (state.status === "completed") redirect(`/cards/${state.cardId}`);
  const extracting = state.status === "extracting";
  const saving = state.status === "saving";
  const saveLocked = saving;
  const busy = state.status === "validating" || extracting || saveLocked;
  const status = saving ? "Saving card…" : extracting
    ? "Analyzing card…"
    : busy
      ? "Checking image…"
      : state.status === "reviewed"
        ? "Review confirmed"
        : state.status === "review"
          ? "Ready for review"
      : state.image
        ? "Image selected"
        : "No image selected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select a card image</CardTitle>
        <p id="scan-file-help" className="text-sm text-muted-foreground">
          JPG, JPEG, PNG, or WEBP. Maximum 10 MB.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="flex flex-col gap-3 sm:flex-row"
          aria-describedby="scan-file-help"
        >
          <ImagePicker
            mode="camera"
            hasImage={!!state.image}
            disabled={busy}
            onSelect={selectImage}
          />
          <ImagePicker
            mode="upload"
            hasImage={!!state.image}
            disabled={busy}
            onSelect={selectImage}
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
          {state.image ? (
            <ImagePreview image={state.image} />
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-5 text-center sm:min-h-72">
              <ImageIcon
                className="size-9 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-medium">Your image preview will appear here</p>
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
            disabled={saveLocked || (!state.image && !busy)}
            onClick={removeImage}
          >
            {extracting
              ? "Cancel extraction and remove image"
              : busy && !state.image
                ? "Cancel selection"
                : "Remove image"}
          </Button>
          <Button
            type="button"
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
          Clicking Extract sends this image to the AI provider for analysis.
          Extraction does not save the card. Review the results, then choose Save card.
          Large photos are resized for analysis; the original image stays available for review.
        </p>
        {result && <CardReviewForm extraction={result} confirmed={reviewedScan !== null} disabled={busy} onConfirm={confirmReview} onChange={invalidateReview} />}
        {reviewedScan && <div className="space-y-3 border-t pt-5">
          <p className="text-sm">Your review is confirmed. Save the original image and corrected card information to your private collection.</p>
          <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={save}>{saving ? "Saving card…" : state.status === "save_error" ? "Retry saving card" : "Save card"}</Button>
        </div>}
        {state.status === "save_error" && state.message.includes("session has expired") && <a className="inline-block py-3 underline" href="/login?next=%2Fscan">Sign in again</a>}
      </CardContent>
    </Card>
  );
}
