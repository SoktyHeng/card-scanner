"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cardOperation } from "./card-operation";
export function CardActions({ id, archived }: {
    id: string;
    archived: boolean;
}) {
    const router = useRouter();
    return <CardActionControls id={id} archived={archived} onCompleted={deleting => {
            if (deleting)
                router.push("/cards");
            router.refresh();
        }}/>;
}
export function CardActionControls({ id, archived, onCompleted }: {
    id: string;
    archived: boolean;
    onCompleted: (deleting: boolean) => void;
}) {
    const { t } = useLanguage();
    const dialog = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const alert = useRef<HTMLDivElement>(null);
    const busy = useRef(false);
    const [pendingAction, setPendingAction] = useState<"archive" | "delete" | null>(null);
    const pending = pendingAction !== null;
    const [error, setError] = useState<string | null>(null);
    async function run(deleting: boolean) {
        if (busy.current)
            return;
        busy.current = true;
        setPendingAction(deleting ? "delete" : "archive");
        setError(null);
        try {
            await cardOperation(id, deleting ? "DELETE" : "PATCH", deleting ? { confirmed: true } : { operation: archived ? "restore" : "archive" });
            onCompleted(deleting);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : "Unable to complete this operation. Please try again.");
        }
        finally {
            dialog.current?.close();
            busy.current = false;
            setPendingAction(null);
            queueMicrotask(() => { if (alert.current)
                alert.current.focus();
            else
                trigger.current?.focus(); });
        }
    }
    return <section aria-label={t("Card actions")} className="space-y-4" aria-busy={pending}>
    <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
      {!pending && <Button asChild variant="outline"><Link href={`/cards/${id}/edit`}><T text={"Edit card"}/></Link></Button>}
      <Button disabled={pending} loading={pendingAction === "archive"} variant="outline" onClick={() => { void run(false); }}>{archived ? <T text={"Restore card"}/> : <T text={"Archive card"}/>}</Button>
      <Button ref={trigger} disabled={pending} loading={pendingAction === "delete"} variant="destructive" onClick={() => dialog.current?.showModal()}><T text={"Delete permanently"}/></Button>
    </div>
    {!pending && <p className="text-sm text-muted-foreground">{archived ? <T text={"Restore this card to show it in your active collection."}/> : <T text={"Archiving keeps this card and image. You can restore it later."}/>}</p>}
    {pending && <p role="status"><T text={"Updating card\u2026"}/></p>}
    {error && <div ref={alert} role="alert" tabIndex={-1} className="rounded-lg border border-destructive p-3 focus-visible:outline-2">{<T text={error}/>} <Link href="/login" target="_blank" rel="noopener noreferrer" className="underline"><T text={"Sign in in a new tab"}/></Link></div>}
    <dialog ref={dialog} aria-labelledby="delete-title" aria-describedby="delete-description" onCancel={event => { if (pending)
        event.preventDefault(); }} onClose={() => trigger.current?.focus()} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
      <h2 id="delete-title" className="text-xl font-semibold"><T text={"Permanently delete this card?"}/></h2>
      <p id="delete-description" className="my-4"><T text={"This removes the card and its original image. This cannot be undone. You can archive the card instead."}/></p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button autoFocus disabled={pending} variant="outline" onClick={() => dialog.current?.close()}><T text={"Cancel"}/></Button>
        <Button disabled={pending} loading={pendingAction === "delete"} variant="destructive" onClick={() => { void run(true); }}>{pendingAction === "delete" ? <T text={"Deleting…"}/> : <T text={"Confirm permanent deletion"}/>}</Button>
      </div>
    </dialog>
  </section>;
}
