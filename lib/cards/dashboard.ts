import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
export async function getDashboard(supabase: SupabaseClient<Database>, userId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [total, scannedToday, archived, recent] = await Promise.all([
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_archived", false),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", today.toISOString()),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_archived", true),
    supabase
      .from("cards")
      .select("id,name,company,card_type,created_at")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const failed = [total, scannedToday, archived, recent].some(
    (result) => result.error,
  );
  if (failed) console.error("dashboard database read failed");
  if (failed) throw new Error("Unable to load dashboard.");
  return { total: total.count, scannedToday: scannedToday.count, archived: archived.count, recent: recent.data ?? [] };
}
