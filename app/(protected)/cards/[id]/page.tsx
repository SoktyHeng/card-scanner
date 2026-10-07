import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSavedCard } from "@/lib/cards/card-detail";
import { fieldLabels, reviewFieldOrder } from "@/lib/cards/review";
import { cardColumns } from "@/lib/cards/management-schema";
import { CardActions } from "@/components/cards/card-actions";
import { SavedCardImage } from "@/components/cards/saved-card-image";
import { Button } from "@/components/ui/button";
export default async function SavedCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await params;
  const result = await getSavedCard(supabase, user.id, id);
  if (!result) notFound();
  const { card, extraFields, imageUrl, imageUnavailable, extraFieldsUnavailable } = result;
  return <article className="mx-auto max-w-3xl space-y-6">
    <Link href={card.is_archived ? "/cards?status=archived" : "/cards"} className="inline-block rounded py-3 underline focus-visible:outline-2">Back to cards</Link>
    <h1 className="break-words text-3xl font-semibold" dir="auto">{card.name || card.company || "Saved card"}</h1>
    <p className="text-sm text-muted-foreground">Your reviewed card and original image.</p>
    {card.is_archived && <p className="rounded-lg border p-3">Archived card</p>}
    <CardActions id={id} archived={card.is_archived} />
    {imageUrl && <SavedCardImage key={imageUrl} url={imageUrl} />}
    {imageUnavailable && <p role="alert" className="rounded-lg border p-3">Unable to load the private image. Reload this page to try again.</p>}
    {!card.original_image_path && <p className="text-sm text-muted-foreground">No original image is available.</p>}
    <dl className="grid gap-4 sm:grid-cols-2">
      {reviewFieldOrder.map(key => <div key={key} className="min-w-0 rounded-lg border p-3">
        <dt className="text-sm text-muted-foreground">{fieldLabels[key]}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words" dir="auto">{card[cardColumns[key]] || "Not provided"}</dd>
      </div>)}
    </dl>
    <section aria-labelledby="saved-extra-heading" className="space-y-3">
      <h2 id="saved-extra-heading" className="text-lg font-semibold">Additional fields</h2>
      {extraFieldsUnavailable ? <p role="alert">Unable to display the additional fields.</p> : extraFields.length ? <dl className="grid gap-3 sm:grid-cols-2">
        {extraFields.map((field, index) => <div key={`${field.key}-${index}`} className="min-w-0 rounded-lg border p-3">
          <dt dir="auto" className="text-sm text-muted-foreground">{field.label ?? "Unknown field"}</dt>
          <dd dir="auto" className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd>
        </div>)}
      </dl> : <p className="text-sm text-muted-foreground">No additional fields.</p>}
    </section>
    <p className="text-sm text-muted-foreground">Saved <time dateTime={card.created_at}>{new Date(card.created_at).toLocaleString("en", { timeZone: "Asia/Phnom_Penh" })}</time></p>
    <p className="text-sm text-muted-foreground">Last updated <time dateTime={card.updated_at}>{new Date(card.updated_at).toLocaleString("en", { timeZone: "Asia/Phnom_Penh" })}</time></p>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer rounded focus-visible:outline-2">Original source text</summary><p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm">{card.raw_ocr_text || "No source text was extracted."}</p></details>
    <Button asChild><Link href="/scan">Scan another card</Link></Button>
  </article>;
}
