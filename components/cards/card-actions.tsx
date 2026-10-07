"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cardOperation } from "./card-operation";

export function CardActions({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  return <CardActionControls id={id} archived={archived} onCompleted={deleting => {
    if (deleting) router.push("/cards");
    router.refresh();
  }} />;
}
export function CardActionControls({ id, archived, onCompleted }: { id: string; archived: boolean; onCompleted: (deleting: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(deleting: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      await cardOperation(id, deleting ? "DELETE" : "PATCH", deleting ? { confirmed: true } : { operation: archived ? "restore" : "archive" });
      onCompleted(deleting);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to complete this operation. Please try again.");
    } finally {
      dialog.current?.close();
      busy.current = false; setPending(false);
      queueMicrotask(() => { if (alert.current) alert.current.focus(); else trigger.current?.focus(); });
    }
  }
  return <section aria-label="Card actions" className="space-y-4" aria-busy={pending}>
    <div className="flex flex-wrap gap-3">
      {!pending && <Button asChild variant="outline"><Link href={`/cards/${id}/edit`}>Edit card</Link></Button>}
      <Button disabled={pending} variant="outline" onClick={() => { void run(false); }}>{archived ? "Restore card" : "Archive card"}</Button>
      <Button ref={trigger} disabled={pending} variant="destructive" onClick={() => dialog.current?.showModal()}>Delete permanently</Button>
    </div>
    {pending && <p role="status">Updating card…</p>}
    {error && <div ref={alert} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-3 focus-visible:outline-2">{error} <Link href="/login" target="_blank" rel="noopener noreferrer" className="underline">Sign in in a new tab</Link></div>}
    <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={event => { if (pending) event.preventDefault(); }} onClose={() => trigger.current?.focus()} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
      <h2 id="delete-title" className="text-xl font-semibold">Permanently delete this card?</h2>
      <p id="delete-description" className="my-4">This removes the card and its original image. This cannot be undone. You can archive the card instead.</p>
      <div className="flex flex-wrap gap-3">
        <Button autoFocus disabled={pending} variant="outline" onClick={() => dialog.current?.close()}>Cancel</Button>
        <Button disabled={pending} variant="destructive" onClick={() => { void run(true); }}>{pending ? "Deleting…" : "Confirm permanent deletion"}</Button>
      </div>
    </dialog>
  </section>;
}
