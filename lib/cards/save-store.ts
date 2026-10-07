import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SaveError, type CardSaveStore } from "./save-service";

export function createCardSaveStore(supabase: SupabaseClient<Database>, userId: string): CardSaveStore {
  const bucket = supabase.storage.from("card-images");
  return {
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
    async insert(record) {
      const { error } = await supabase.from("cards").insert(record);
      if (error) throw new SaveError("INSERT_FAILED");
    },
    async remove(path) {
      const { data, error } = await bucket.remove([path]);
      if (error || !data?.length) {
        console.warn("Card upload cleanup failed");
        return false;
      }
      return true;
    },
  };
}
