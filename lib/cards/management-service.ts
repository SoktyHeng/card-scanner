import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cardMutationSchema, correctedColumns, ownsImagePath } from "./management-schema";
import type { z } from "zod";

export class ManagementError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const missing = () => new ManagementError(404, "NOT_FOUND", "This card was not found or is no longer available.");
const failed = () => new ManagementError(503, "OPERATION_FAILED", "Unable to update this card. Please try again.");

export async function mutateCard(supabase: SupabaseClient<Database>, userId: string, id: string, input: z.output<typeof cardMutationSchema>) {
  const data = cardMutationSchema.parse(input);
  const changes = data.operation === "update" ? correctedColumns(data.reviewedData) : { is_archived: data.operation === "archive" };
  let query = supabase.from("cards").update(changes).eq("user_id", userId).eq("id", id);
  if (data.operation === "update") query = query.eq("updated_at", data.expectedUpdatedAt);
  const result = await query.select("id").maybeSingle();
  if (result.error) throw failed();
  if (!result.data) {
    const existing = await supabase.from("cards").select("id").eq("user_id", userId).eq("id", id).maybeSingle();
    if (existing.error) throw failed();
    if (!existing.data) throw missing();
    throw new ManagementError(409, "CONFLICT", "This card changed since you opened it. Keep a copy of your edits, then reload before saving.");
  }
}

export async function permanentlyDeleteCard(supabase: SupabaseClient<Database>, userId: string, id: string) {
  // Archive first: a partial failure remains recoverable and hidden from the active list.
  const archived = await supabase.from("cards").update({ is_archived: true }).eq("user_id", userId).eq("id", id)
    .select("original_image_path,updated_at").maybeSingle();
  if (archived.error) throw failed();
  if (!archived.data) throw missing();
  const path = archived.data.original_image_path;
  if (path) {
    if (!ownsImagePath(userId, id, path)) throw new ManagementError(409, "INVALID_IMAGE_PATH", "The card is archived. Its image path could not be verified; deletion was stopped.");
    const removed = await supabase.storage.from("card-images").remove([path]);
    if (removed.error) throw new ManagementError(503, "IMAGE_DELETE_FAILED", "The card is archived. Unable to remove its image; retry permanent deletion.");
    // Storage removal is idempotent, but an empty response must be distinguished
    // from a denied operation before deleting the only record of the image path.
    if (!removed.data?.length) {
      const folder = path.slice(0, path.lastIndexOf("/"));
      const name = path.slice(path.lastIndexOf("/") + 1);
      const check = await supabase.storage.from("card-images").list(folder, { search: name, limit: 100 });
      if (check.error || check.data.some(file => file.name === name))
        throw new ManagementError(503, "IMAGE_DELETE_FAILED", "The card is archived. Image cleanup could not be confirmed; retry permanent deletion.");
    }
  }
  const removed = await supabase.from("cards").delete().eq("user_id", userId).eq("id", id)
    .eq("updated_at", archived.data.updated_at).select("id").maybeSingle();
  if (removed.error || !removed.data) throw new ManagementError(503, "DELETE_INCOMPLETE", "The image was removed, but the card record could not be deleted. It may have changed during deletion. Reload and retry; the remaining record is archived unless restored in another session.");
}
