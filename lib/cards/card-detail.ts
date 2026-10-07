import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { reviewedCardSchema } from "./review";
import { ownsImagePath } from "./management-schema";

export const SIGNED_IMAGE_SECONDS = 300;
export async function getSavedCard(supabase: SupabaseClient<Database>, userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("cards").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load this card. Please try again.");
  if (!data) return null;
  const extras = reviewedCardSchema.shape.extraFields.safeParse(data.extra_fields);
  let imageUrl: string | null = null;
  let imageUnavailable = false;
  const path = data.original_image_path;
  if (path) {
    if (!ownsImagePath(userId, id, path)) imageUnavailable = true;
    else {
      const signed = await supabase.storage.from("card-images").createSignedUrl(path, SIGNED_IMAGE_SECONDS);
      imageUrl = signed.data?.signedUrl ?? null;
      imageUnavailable = !!signed.error || !imageUrl;
    }
  }
  return { card: data, extraFields: extras.success ? extras.data : [], extraFieldsUnavailable: !extras.success, imageUrl, imageUnavailable };
}

export const CARDS_PER_PAGE = 24;
export async function getCardList(supabase: SupabaseClient<Database>, userId: string, archived: boolean, page: number) {
  const result = await supabase.from("cards")
    .select("id,name,company,job_title,phone,email,created_at,original_image_path")
    .eq("user_id", userId).eq("is_archived", archived)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
  if (result.error) throw new Error("Unable to load your cards. Please try again.");
  const hasNext = result.data.length > CARDS_PER_PAGE;
  const cards = await Promise.all(result.data.slice(0, CARDS_PER_PAGE).map(async card => {
    let imageUrl: string | null = null;
    if (card.original_image_path && ownsImagePath(userId, card.id, card.original_image_path)) {
      const signed = await supabase.storage.from("card-images").createSignedUrl(card.original_image_path, SIGNED_IMAGE_SECONDS);
      imageUrl = signed.data?.signedUrl ?? null;
    }
    return { ...card, imageUrl };
  }));
  return { cards, hasNext };
}
