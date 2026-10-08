import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SaveError, type CardSaveStore } from "./save-service";
import { findDuplicateCards } from "./duplicate-check";

export function createCardSaveStore(supabase: SupabaseClient<Database>, userId: string): CardSaveStore {
  const bucket = supabase.storage.from("card-images");
  return {
    findDuplicates: (data, excludedId) => findDuplicateCards(supabase, userId, data, excludedId),
    async findCard(id) {
      const { data, error } = await supabase.from("cards").select("id")
        .eq("user_id", userId).eq("id", id).maybeSingle();
      if (error) throw new SaveError("SAVE_STATUS_UNKNOWN");
      return data;
    },
    async upload(path, image) {
      const { error } = await bucket.upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
      if (error) {
        if ("statusCode" in error && String(error.statusCode) === "409") return "exists";
        console.warn("Card storage upload failed");
        throw new SaveError("UPLOAD_FAILED");
      }
      return "uploaded";
    },
    async insert(record, images) {
      const { error } = await supabase.rpc("save_card_with_images", { p_card: record, p_images: images });
      if (error) throw new SaveError("INSERT_FAILED");
    },
    async remove(path) {
      const { data, error } = await bucket.remove([path]);
      if (error) {
        console.warn("Card upload cleanup failed");
        return false;
      }
      if (!data?.length) {
        // An already-removed object is safe only after confirming absence.
        // Never interpret an empty/denied deletion response as successful cleanup.
        const folder = path.slice(0, path.lastIndexOf("/"));
        const name = path.slice(path.lastIndexOf("/") + 1);
        const check = await bucket.list(folder, { search: name, limit: 100 });
        return !check.error && !check.data.some(file => file.name === name);
      }
      return true;
    },
  };
}
