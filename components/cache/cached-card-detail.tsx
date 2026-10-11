"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useWorkspaceData } from "@/components/cache/workspace-cache";
import { CardDetailSkeleton } from "@/components/cards/card-skeletons";
import { CacheReadError } from "@/components/cache/read-error";
import type { getSavedCard } from "@/lib/cards/card-detail";
import { reviewFieldOrder } from "@/lib/cards/review";
import { hasFieldValue } from "@/lib/cards/field-value";
import { SavedCardFields } from "@/components/cards/saved-card-fields";
import { cardColumns } from "@/lib/cards/management-schema";
import { CardActions } from "@/components/cards/card-actions";
import { FlippableCardImage } from "@/components/cards/flippable-card-image";
import { Button } from "@/components/ui/button";
export function CachedCardDetail({ id }: {
    id: string;
}) {
    const { date } = useLanguage();
    const { data: result, error, retry } = useWorkspaceData<NonNullable<Awaited<ReturnType<typeof getSavedCard>>>>(`type=detail&id=${id}`, 30000, true);
    if (error)
        return <CacheReadError retry={retry}/>;
    if (!result)
        return <CardDetailSkeleton />;
    const { card, extraFields, imageUrl, backImageUrl, imageUnavailable, extraFieldsUnavailable } = result;
    return <article className="mx-auto max-w-3xl space-y-6">
    <Link href={card.is_archived ? "/cards?status=archived" : "/cards"} className="inline-block rounded py-3 underline focus-visible:outline-2"><T text={"Back to cards"}/></Link>
    <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl" dir="auto">{hasFieldValue(card.name) ? card.name : hasFieldValue(card.company) ? card.company : <T text={"Saved card"}/>}</h1>
    <p className="text-sm text-muted-foreground"><T text={"Your reviewed card and original image."}/> <T text="Dates and times use Cambodia time (UTC+7)."/></p>
    {card.is_archived && <p className="rounded-lg border p-3"><T text={"Archived card"}/></p>}
    <CardActions id={id} archived={card.is_archived}/>
    <FlippableCardImage key={`${imageUrl}-${backImageUrl}`} frontUrl={imageUrl} backUrl={backImageUrl}/>
    {imageUnavailable && <p role="alert" className="rounded-lg border p-3"><T text={"Unable to load the private image. Reload this page to try again."}/></p>}
    {!card.original_image_path && <p className="text-sm text-muted-foreground"><T text={"No original image is available."}/></p>}
    <SavedCardFields fields={reviewFieldOrder.map(key => ({ key, value: card[cardColumns[key]] }))} extraFields={extraFields} extraFieldsUnavailable={extraFieldsUnavailable}/>
    <p className="text-sm text-muted-foreground"><T text={"Saved "}/><time dateTime={card.created_at}>{date(card.created_at, { dateStyle: "medium", timeStyle: "short" })}</time></p>
    <p className="text-sm text-muted-foreground"><T text={"Last updated "}/><time dateTime={card.updated_at}>{date(card.updated_at, { dateStyle: "medium", timeStyle: "short" })}</time></p>
    {hasFieldValue(card.raw_ocr_text) && <details className="rounded-lg border p-3"><summary className="cursor-pointer rounded focus-visible:outline-2"><T text={"Original source text"}/></summary><p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm">{card.raw_ocr_text}</p></details>}
    <Button asChild><Link href="/scan"><T text={"Scan another card"}/></Link></Button>
  </article>;
}
