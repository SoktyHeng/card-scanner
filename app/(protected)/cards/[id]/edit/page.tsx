import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSavedCard } from "@/lib/cards/card-detail";
import { savedCardDraft } from "@/lib/cards/management-schema";
import { extractedCardSchema } from "@/lib/ai/card-schema";
import { SavedCardImage } from "@/components/cards/saved-card-image";
import { CardEditForm } from "@/components/cards/card-edit-form";

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await params;
  const result = await getSavedCard(supabase, user.id, id);
  if (!result) notFound();
  const extraction = extractedCardSchema.safeParse(result.card.ai_extraction);
  // Refuse malformed saved fields rather than silently dropping them on save.
  const initialData = savedCardDraft(result.card);
  return <article className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-3xl font-semibold">Edit saved card</h1>
    {result.card.is_archived && <p className="rounded-lg border p-3">This card is archived. Editing does not restore it.</p>}
    {result.imageUrl && <SavedCardImage key={result.imageUrl} url={result.imageUrl} />}
    {result.imageUnavailable && <p role="alert">Unable to load the image. Reload to try again.</p>}
    <CardEditForm key={result.card.updated_at} id={id} updatedAt={result.card.updated_at} initialData={initialData} rawText={result.card.raw_ocr_text} extraction={extraction.success ? extraction.data : undefined} />
  </article>;
}
