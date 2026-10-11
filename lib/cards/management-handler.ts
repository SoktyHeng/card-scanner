import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { cardDeleteSchema, cardMutationSchema } from "./management-schema";
import { ManagementError, mutateCard, permanentlyDeleteCard } from "./management-service";
import { isSameOriginRequest } from "@/lib/auth/request-origin";

type Context = { userId: string; supabase: SupabaseClient<Database> };
function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function createManagementHandler(authenticate: () => Promise<Context | null>, deleting = false) {
  return async (request: Request, route: { params: Promise<{ id: string }> }) => {
    try {
      if (!isSameOriginRequest(request)) throw new ManagementError(403, "FORBIDDEN", "This request could not be verified.");
      const context = await authenticate();
      if (!context) throw new ManagementError(401, "UNAUTHORIZED", "Your session has expired. Sign in again; unsaved changes remain here until you leave.");
      const { id } = await route.params;
      if (!z.uuid().safeParse(id).success) throw new ManagementError(404, "NOT_FOUND", "This card was not found.");
      if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new ManagementError(400, "INVALID_REQUEST", "Submit reviewed card data as JSON.");
      // Bound actual bytes, including chunked requests, before parsing JSON.
      const reader = request.body?.getReader();
      if (!reader) throw new ManagementError(400, "INVALID_REQUEST", "No card data was submitted.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 1024 * 1024) { await reader.cancel(); throw new ManagementError(413, "INVALID_REQUEST", "Card data is too large."); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw new ManagementError(400, "INVALID_REQUEST", "Unable to read the submitted card data."); }
      let updatedAt: string | undefined;
      if (deleting) {
        if (!cardDeleteSchema.safeParse(body).success) throw new ManagementError(400, "INVALID_REQUEST", "Confirm permanent deletion first.");
        await permanentlyDeleteCard(context.supabase, context.userId, id);
      } else {
        const validated = cardMutationSchema.safeParse(body);
        if (!validated.success) throw new ManagementError(400, "INVALID_REQUEST", "Check the corrected card fields before saving.");
        updatedAt = await mutateCard(context.supabase, context.userId, id, validated.data);
      }
      return reply({ success: true, ...(updatedAt ? {updatedAt} : {}) });
    } catch (error) {
      if (error instanceof ManagementError) return reply({ success: false, error: { code: error.code, message: error.message } }, error.status);
      console.error("Card management operation failed");
      return reply({ success: false, error: { code: "OPERATION_FAILED", message: "Unable to complete this operation. Reload to check its status before retrying." } }, 503);
    }
  };
}
