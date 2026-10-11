import "server-only";
import { cardTagsSchema } from "./organization-schema";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { reviewedCardSchema } from "./review";
import { ownsImagePath } from "./management-schema";
import { cardSearchQuerySchema, cardListFiltersSchema, cardDateBounds, DEFAULT_CARD_FILTERS, type CardListFilters } from "./search";
import { loadCardImagePaths } from "./image-paths";

export const SIGNED_IMAGE_SECONDS = 300;
export async function getSavedCard(supabase: SupabaseClient<Database>, userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("cards").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load this card. Please try again.");
  if (!data) return null;
  const tagResult = await supabase.rpc("card_tag_names", {p_id: id});
  if (tagResult.error) throw new Error("Unable to load card organization.");
  const tags = cardTagsSchema.parse(tagResult.data);
  const extras = reviewedCardSchema.shape.extraFields.safeParse(data.extra_fields);
  let imageUrl: string | null = null;
  let imageUnavailable = false;
  let backImageUrl: string | null = null;
  try {
    const { images } = await loadCardImagePaths(supabase, userId, id, data.original_image_path);
    for (const image of images) {
      const signed = await supabase.storage.from("card-images").createSignedUrl(image.storage_path, SIGNED_IMAGE_SECONDS);
      const url = signed.error ? null : signed.data?.signedUrl ?? null;
      if (!url) imageUnavailable = true;
      if (image.side === "front") imageUrl = url;
      else backImageUrl = url;
    }
  } catch { imageUnavailable = true; }
  return { card: data, tags, extraFields: extras.success ? extras.data : [], extraFieldsUnavailable: !extras.success, imageUrl, backImageUrl, imageUnavailable };
}

export const CARDS_PER_PAGE = 24;
export async function getCardList(supabase: SupabaseClient<Database>, userId: string, archived: boolean, page: number, query = "", input: CardListFilters = DEFAULT_CARD_FILTERS) {
  const keyword = cardSearchQuerySchema.parse(query);
  const filters = cardListFiltersSchema.parse(input);
  const dates = cardDateBounds(filters);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Invalid card list page.");
  // Empty search uses the existing list query and does not require the RPC.
  const source = filters.tag || filters.favorites === "1" ? supabase.rpc("filter_cards", {p_query: keyword, p_tag: filters.tag ?? "", p_favorites: filters.favorites === "1"}) : keyword ? supabase.rpc("search_cards", { p_query: keyword }) : supabase.from("cards");
  let request = source
    .select("id,name,company,job_title,phone,email,created_at,original_image_path")
    .eq("user_id", userId).eq("is_archived", archived);
  if (filters.cardType) request = request.eq("card_type", filters.cardType);
  if (filters.company) request = request.eq("company", filters.company);
  if (dates.from) request = request.gte("created_at", dates.from);
  if (dates.until) request = request.lt("created_at", dates.until);
  if (filters.sort === "name_asc" || filters.sort === "name_desc")
    request = request.order("name", { ascending: filters.sort === "name_asc", nullsFirst: false });
  request = request.order("created_at", { ascending: filters.sort === "oldest" }).order("id", { ascending: filters.sort === "oldest" });
  const result = await request.range((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
  if (result.error) throw new Error("Unable to load your cards. Please try again.");
  const hasNext = result.data.length > CARDS_PER_PAGE;
  const visibleCards = result.data.slice(0, CARDS_PER_PAGE);
  const paths = visibleCards.flatMap(card => card.original_image_path && ownsImagePath(userId, card.id, card.original_image_path) ? [card.original_image_path] : []);
  const imageUrls = new Map<string, string>();
  if (paths.length) {
    try {
      const signed = await supabase.storage.from("card-images").createSignedUrls(paths, SIGNED_IMAGE_SECONDS);
      if (!signed.error) for (const image of signed.data ?? []) {
        if (image.path && paths.includes(image.path) && !image.error && image.signedUrl) imageUrls.set(image.path, image.signedUrl);
      }
    } catch {
      // Keep the card list usable during a storage outage.
    }
  }
  const cards = visibleCards.map(card => ({ ...card, imageUrl: imageUrls.get(card.original_image_path ?? "") ?? null }));
  return { cards, hasNext };
}
