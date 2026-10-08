import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { z } from "zod";
import { ownsImagePath } from "./management-schema";

const imageRows = z.array(z.object({ side: z.enum(["front", "back"]), storage_path: z.string() })).max(2);
// Call only after verifying ownership of the parent card. RLS also enforces it.
export async function loadCardImagePaths(supabase: SupabaseClient<Database>, userId: string, id: string, legacyPath: string | null) {
  const result = await supabase.from("card_images").select("side,storage_path").eq("card_id", id);
  if (result.error) throw new Error("Unable to load card images.");
  const parsed = imageRows.safeParse(result.data);
  if (!parsed.success) throw new Error("Invalid card images.");
  const images = parsed.data;
  if (legacyPath && !images.some(image => image.side === "front")) images.unshift({ side: "front", storage_path: legacyPath });
  if (new Set(images.map(image => image.side)).size !== images.length || images.some(image => !ownsImagePath(userId, id, image.storage_path)
    || !(image.side === "front" ? /\/(original|front)\.(jpg|png|webp)$/ : /\/back\.(jpg|png|webp)$/).test(image.storage_path))) throw new Error("Invalid card image path.");
  if (legacyPath && !ownsImagePath(userId, id, legacyPath)) throw new Error("Invalid original image path.");
  // Keep a legacy path for cleanup even if its metadata was changed independently.
  return { images, paths: [...new Set([...images.map(image => image.storage_path), ...(legacyPath ? [legacyPath] : [])])] };
}
