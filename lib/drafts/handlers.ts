import "server-only";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/auth/request-origin";
import { readBoundedMultipart, validateOriginalImage } from "@/lib/ai/upload";
import { MAX_SAVE_BODY_BYTES, MAX_SAVE_DATA_BYTES } from "@/lib/cards/save-handler";
import { DuplicateWarningError, SaveError } from "@/lib/cards/save-service";
import { DraftError, draftWriteSchema, draftRevisionSchema, draftSaveSchema } from "./schema";
import { discardDraft, listDrafts, restoreDraft, saveDraftCard, writeDraft, type DraftContext } from "./service";

type Authenticate = () => Promise<DraftContext | null>;
type Route = { params: Promise<{ id: string }> };
function response(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
export function draftFailure(error: unknown) {
  if (error instanceof DuplicateWarningError) return response({ success: false, error: { code: error.code, message: error.message }, duplicateWarning: error.warning }, 409);
  if (error instanceof SaveError) return response({ success: false, error: { code: error.code, message: error.message } }, error.code === "SAVE_IN_PROGRESS" ? 409 : 503);
  const failure = error instanceof DraftError ? error : new DraftError("UNAVAILABLE");
  return response({ success: false, error: { code: failure.code, message: failure.message } },
    failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403 : failure.code === "NOT_FOUND" ? 404
      : failure.code === "CONFLICT" || failure.code === "BUSY" ? 409 : failure.code === "LIMIT" ? 429 : failure.code === "INVALID_DRAFT" ? 422 : 503);
}
async function context(auth: Authenticate, request: Request) {
  if (request.method !== "GET" && !isSameOriginRequest(request)) throw new DraftError("FORBIDDEN");
  const value = await auth();
  if (!value || (request.headers.has("x-draft-owner") && request.headers.get("x-draft-owner") !== value.userId)) throw new DraftError("UNAUTHORIZED");
  return value;
}
async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body) throw new DraftError("INVALID_DRAFT");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_SAVE_DATA_BYTES) { await reader.cancel(); throw new DraftError("INVALID_DRAFT"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { throw new DraftError("INVALID_DRAFT"); } finally { reader.releaseLock(); }
}
export function draftHandlers(auth: Authenticate) {
  return {
    async GET(request: Request) { try { return response({ drafts: await listDrafts(await context(auth, request)) }); } catch (error) { return draftFailure(error); } },
    async POST(request: Request) {
      try {
        const owner = await context(auth, request);
        const form = await readBoundedMultipart(request, MAX_SAVE_BODY_BYTES).catch(() => { throw new DraftError("INVALID_DRAFT"); });
        if ([...form.keys()].some(key => !["data", "image", "backImage"].includes(key)) || form.getAll("data").length !== 1 || form.getAll("image").length > 1 || form.getAll("backImage").length > 1) throw new DraftError("INVALID_DRAFT");
        const json = form.get("data");
        if (typeof json !== "string" || Buffer.byteLength(json) > MAX_SAVE_DATA_BYTES) throw new DraftError("INVALID_DRAFT");
        let input: unknown; try { input = JSON.parse(json); } catch { throw new DraftError("INVALID_DRAFT"); }
        const parsed = draftWriteSchema.safeParse(input); if (!parsed.success) throw new DraftError("INVALID_DRAFT");
        const image = form.get("image"), backImage = form.get("backImage");
        if ((parsed.data.frontMode === "replace") !== (image instanceof File) || (parsed.data.backMode === "replace") !== (backImage instanceof File)
          || (image !== null && !(image instanceof File)) || (backImage !== null && !(backImage instanceof File))) throw new DraftError("INVALID_DRAFT");
        const front = image instanceof File ? await validateOriginalImage(image).catch(() => { throw new DraftError("INVALID_DRAFT"); }) : undefined;
        const back = backImage instanceof File ? await validateOriginalImage(backImage).catch(() => { throw new DraftError("INVALID_DRAFT"); }) : undefined;
        return response({ meta: await writeDraft(owner, parsed.data, front, back) });
      } catch (error) { return draftFailure(error); }
    },
  };
}
export function singleDraftHandlers(auth: Authenticate) {
  const id = async (route: Route) => { const parsed = z.uuid().safeParse((await route.params).id); if (!parsed.success) throw new DraftError("INVALID_DRAFT"); return parsed.data.toLowerCase(); };
  return {
    async GET(request: Request, route: Route) { try { return response(await restoreDraft(await context(auth, request), await id(route))); } catch (error) { return draftFailure(error); } },
    async DELETE(request: Request, route: Route) {
      try {
        const owner = await context(auth, request), draftId = await id(route);
        const parsed = draftRevisionSchema.safeParse(await readJson(request)); if (!parsed.success) throw new DraftError("INVALID_DRAFT");
        await discardDraft(owner, draftId, parsed.data.expectedRevision);
        return response({ success: true });
      } catch (error) { return draftFailure(error); }
    },
    async SAVE(request: Request, route: Route) {
      try {
        const owner = await context(auth, request), draftId = await id(route);
        const parsed = draftSaveSchema.safeParse(await readJson(request)); if (!parsed.success) throw new DraftError("INVALID_DRAFT");
        return response({ success: true, id: await saveDraftCard(owner, draftId, parsed.data) }, 201);
      } catch (error) { return draftFailure(error); }
    },
  };
}
