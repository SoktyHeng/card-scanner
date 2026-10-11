"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useLayoutEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { duplicateReasons, type DuplicateWarning as Warning } from "@/lib/cards/duplicates";
export function DuplicateWarning({ warning, disabled, onSaveAnyway, onCancel }: {
    warning: Warning;
    disabled: boolean;
    onSaveAnyway: () => void;
    onCancel: () => void;
}) {
    const { t } = useLanguage();
    const id = useId();
    const heading = useRef<HTMLHeadingElement>(null);
    useLayoutEffect(() => { heading.current?.focus(); }, [warning]);
    return <section aria-labelledby={id} className="space-y-4 rounded-xl border border-amber-500/60 bg-amber-50/40 p-4 dark:bg-amber-950/20">
    <h2 id={id} ref={heading} tabIndex={-1} className="rounded text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"><T text={"Possible duplicate found"}/></h2>
    <p className="text-sm leading-relaxed"><T text={"Check these cards before saving another copy. View existing opens a new tab and keeps your review here."}/></p>
    <ul className="space-y-3">
      {warning.matches.map(card => <li key={card.id} className="min-w-0 space-y-2 rounded-lg border bg-card p-3">
        <h3 dir="auto" className="break-words font-medium">{card.name || card.company || <T text={"Untitled card"}/>}</h3>
        {card.company && card.name && <p dir="auto" className="break-words text-sm text-muted-foreground">{card.company}</p>}
        {card.archived && <p className="text-sm"><T text={"Archived card"}/></p>}
        <ul className="list-inside list-disc text-sm">{card.reasons.map(reason => <li key={reason}>{<T text={duplicateReasons[reason]}/>}</li>)}</ul>
        <Link href={`/cards/${card.id}`} target="_blank" rel="noopener noreferrer" className="inline-block rounded py-3 text-sm underline focus-visible:outline-2" aria-label={t("View existing {name} in a new tab", {name: card.name || card.company || t("Card")})}><T text={"View existing "}/><span className="text-muted-foreground"><T text={"(new tab)"}/></span></Link>
      </li>)}
    </ul>
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button type="button" loading={disabled} onClick={onSaveAnyway}>{disabled ? <T text={"Saving card…"}/> : <T text={"Save anyway"}/>}</Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}><T text={"Cancel"}/></Button>
    </div>
  </section>;
}
