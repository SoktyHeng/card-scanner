"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedCard } from "@/lib/ai/types";
import type { ReviewedCard } from "@/lib/cards/review";
import { CardReviewForm } from "./card-review-form";
import { cardOperation } from "./card-operation";

type CardEditProps = {
  id: string; updatedAt: string; initialData: ReviewedCard; extraction?: ExtractedCard; rawText: string | null;
};
export function CardEditForm(props: CardEditProps) {
  const router = useRouter();
  return <CardEditControls {...props} onSaved={() => { router.push(`/cards/${props.id}`); router.refresh(); }} />;
}
export function CardEditControls({ id, updatedAt, initialData, extraction, rawText, onSaved }: CardEditProps & { onSaved: () => void }) {
  const busy = useRef(false);
  const alert = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(reviewedData: ReviewedCard) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(null);
    try {
      await cardOperation(id, "PATCH", { operation: "update", expectedUpdatedAt: updatedAt, reviewedData });
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save changes. Please try again.");
      busy.current = false; setSaving(false);
      queueMicrotask(() => alert.current?.focus());
    }
  }
  return <div className="space-y-4" aria-busy={saving}>
    {error && <div ref={alert} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-3 focus-visible:outline-2">{error} <span>Your draft has been kept.</span> <Link href="/login" target="_blank" rel="noopener noreferrer" className="underline">Sign in in a new tab</Link></div>}
    {saving && <p role="status">Saving changes…</p>}
    <CardReviewForm initialData={initialData} extraction={extraction} rawText={rawText} editing confirmed={false} disabled={saving} onConfirm={data => { void save(data); }} onChange={() => setError(null)} />
    {!saving && <Link href={`/cards/${id}`} className="inline-block rounded py-3 underline focus-visible:outline-2">Cancel editing</Link>}
  </div>;
}
