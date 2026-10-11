import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getDashboard } from "./dashboard";
import { getCardList, getSavedCard, SIGNED_IMAGE_SECONDS } from "./card-detail";
import { parseCardListParams } from "./search";
type ReadContext = { userId: string; supabase: SupabaseClient<Database> };
function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function createWorkspaceReadHandler(authenticate: () => Promise<ReadContext | null>) {
  return async function GET(request: Request) {
    try {
      const context = await authenticate();
      if (!context) return reply({ error: "Session expired." }, 401);
      const params = new URL(request.url).searchParams;
      const type = params.get("type");
      const allowed = type === "cards" ? ["type", "q", "status", "page", "cardType", "company", "from", "to", "sort", "tag", "favorites"] : type === "detail" ? ["type", "id"] : ["type"];
      if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return reply({ error: "Invalid request." }, 400);
      const { userId, supabase } = context;
      const imagesExpireAt = Date.now() + SIGNED_IMAGE_SECONDS * 1000;
      let data: unknown;
      if (type === "dashboard") data = await getDashboard(supabase, userId);
      else if (type === "cards") {
        const parsed = parseCardListParams(Object.fromEntries([...params].filter(([key]) => key !== "type")));
        if (parsed.error || (params.has("page") && (!/^[1-9]\d{0,5}$/.test(params.get("page")!) || Number(params.get("page")) > 100000))) return reply({ error: "Invalid filters." }, 400);
        data = await getCardList(supabase, userId, parsed.archived, parsed.page, parsed.query, parsed.filters);
      } else if (type === "detail") {
        const id = z.uuid().safeParse(params.get("id"));
        if (!id.success) return reply({ error: "Invalid card." }, 400);
        data = await getSavedCard(supabase, userId, id.data);
        if (!data) return reply({ error: "Card not found." }, 404);
      } else return reply({ error: "Invalid request." }, 400);
      return reply({ owner: userId, data, imagesExpireAt });
    } catch { return reply({ error: "Unable to load data. Please try again." }, 503); }
  };
}
