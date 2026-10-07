import { extractCard } from "@/lib/ai/card-extractor";
import { createExtractionHandler } from "@/lib/ai/extraction-handler";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 150;

export const POST = createExtractionHandler({
  async authenticate() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (
      error &&
      (error.status === 0 ||
        (error.status !== undefined && error.status >= 500))
    )
      throw new Error("Auth unavailable");
    return !error && !!data.user;
  },
  extract: extractCard,
});
