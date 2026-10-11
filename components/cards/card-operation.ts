import { z } from "zod";
import { invalidateWorkspaceCache } from "@/lib/cache/events";
const responseSchema = z.discriminatedUnion("success", [
  z.strictObject({ success: z.literal(true), updatedAt: z.iso.datetime({offset: true}).optional() }),
  z.strictObject({ success: z.literal(false), error: z.strictObject({ code: z.string(), message: z.string().max(1000) }) }),
]);
const unavailable = "Unable to complete this operation. Reload to check its status before retrying.";
const messages: Record<string, string> = {
  UNAUTHORIZED: "Your session has expired. Sign in in a new tab; your draft remains here.",
  NOT_FOUND: "This card was not found or is no longer available.",
  CONFLICT: "This card changed since you opened it. Keep a copy of your edits, then reload before saving.",
  INVALID_REQUEST: "Check the corrected card fields and confirmation before trying again.",
  FORBIDDEN: "This request could not be verified.",
  INVALID_IMAGE_PATH: "The card is archived. Its image path could not be verified; deletion was stopped.",
  IMAGE_DELETE_FAILED: "The card is archived. Image cleanup could not be confirmed; retry permanent deletion.",
  DELETE_INCOMPLETE: "The image was removed, but the card record could not be deleted. Reload to check its status before retrying.",
};
export async function cardOperation(id: string, method: "PATCH" | "DELETE", body: unknown) {
  // Even a failed/uncertain response can follow a partially completed mutation.
  try { return await performCardOperation(id, method, body); }
  finally { invalidateWorkspaceCache(method === "DELETE"); }
}
async function performCardOperation(id: string, method: "PATCH" | "DELETE", body: unknown) {
  let response: Response;
  let data: unknown;
  try {
    response = await fetch(`/api/cards/${id}`, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    data = await response.json();
  } catch { throw new Error(unavailable); }
  const result = responseSchema.safeParse(data);
  if (!result.success) throw new Error(unavailable);
  if (!result.data.success) throw new Error(messages[result.data.error.code] ?? unavailable);
  if (!response.ok) throw new Error(unavailable);
  return result.data;
}
