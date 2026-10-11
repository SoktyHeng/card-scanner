import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { CachedCardDetail } from "@/components/cache/cached-card-detail";
export default async function SavedCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, supabase } = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  // Preserve server-side 404/ownership checks; full data and images use the browser cache.
  const { data, error } = await supabase.from("cards").select("id").eq("user_id", user.id).eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load this card. Please try again.");
  if (!data) notFound();
  return <CachedCardDetail id={id} />;
}
