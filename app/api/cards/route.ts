import { createClient } from "@/lib/supabase/server";
import { createSaveCardHandler } from "@/lib/cards/save-handler";
import { createCardSaveStore } from "@/lib/cards/save-store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = createSaveCardHandler(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && (error.status === 0 || (error.status !== undefined && error.status >= 500))) throw new Error("Auth unavailable");
  if (error || !data.user) return null;
  return { userId: data.user.id, store: createCardSaveStore(supabase, data.user.id) };
});
