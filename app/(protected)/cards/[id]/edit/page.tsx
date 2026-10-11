import { T } from "@/components/i18n/language-provider";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSavedCard } from "@/lib/cards/card-detail";
import { savedCardDraft } from "@/lib/cards/management-schema";
import { extractedCardSchema } from "@/lib/ai/card-schema";
import { FlippableCardImage } from "@/components/cards/flippable-card-image";
import { CardEditForm } from "@/components/cards/card-edit-form";
import Link from "next/link";
export default async function EditCardPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { user, supabase } = await requireUser();
    const { id } = await params;
    const result = await getSavedCard(supabase, user.id, id);
    if (!result)
        notFound();
    const extraction = extractedCardSchema.safeParse(result.card.ai_extraction);
    // Refuse malformed saved fields rather than silently dropping them on save.
    const initialData = savedCardDraft(result.card);
    return <article className="mx-auto max-w-3xl space-y-6">
    <Link href={`/cards/${id}`} className="inline-flex min-h-11 items-center rounded-lg text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"><T text={"Back to card"}/></Link>
    <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl"><T text={"Edit saved card"}/></h1><p className="mt-2 text-sm text-muted-foreground"><T text={"Update the details below, then save your changes."}/></p></div>
    {result.card.is_archived && <p className="rounded-lg border p-3"><T text={"This card is archived. Editing does not restore it."}/></p>}
    <FlippableCardImage key={`${result.imageUrl}-${result.backImageUrl}`} frontUrl={result.imageUrl} backUrl={result.backImageUrl}/>
    {result.imageUnavailable && <p role="alert"><T text={"Unable to load the image. Reload to try again."}/></p>}
    <CardEditForm key={result.card.updated_at} id={id} updatedAt={result.card.updated_at} initialData={initialData} rawText={result.card.raw_ocr_text} extraction={extraction.success ? extraction.data : undefined}/>
  </article>;
}
