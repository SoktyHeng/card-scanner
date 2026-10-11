import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, ScanDraftRow } from "@/types/database";
import type { ExtractionImage } from "@/lib/ai/types";
import { validateOriginalImage } from "@/lib/ai/upload";
import { createCardSaveStore } from "@/lib/cards/save-store";
import { saveReviewedCard, submissionCardId, SaveError } from "@/lib/cards/save-service";
import { validateReviewDraft, createReviewDraft } from "@/lib/cards/review";
import { DRAFT_BUCKET, DraftError, draftPayloadSchema, type DraftMeta, type draftWriteSchema, type draftSaveSchema } from "./schema";

export type DraftContext = { userId: string; supabase: SupabaseClient<Database> };
function checked(error: { code?: string } | null) {
  if (!error) return;
  console.warn("Draft database request failed", { code: error.code ?? "unknown" });
  throw new DraftError(error.code === "54000" ? "LIMIT" : error.code === "40001" ? "CONFLICT" : error.code === "55P03" ? "BUSY" : error.code === "P0002" ? "NOT_FOUND" : "UNAVAILABLE");
}
export function draftMeta(row: ScanDraftRow): DraftMeta { return { id: row.id, revision: row.revision, expiresAt: row.expires_at, updatedAt: row.updated_at }; }
export async function findDraft({ supabase, userId }: DraftContext, id: string) {
  const result = await supabase.from("scan_drafts").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  checked(result.error);
  return result.data;
}
function active(row: ScanDraftRow | null): asserts row is ScanDraftRow {
  if (!row || new Date(row.expires_at).getTime() <= Date.now() || !["active", "saving"].includes(row.state)) throw new DraftError("NOT_FOUND");
}
function assetPath(owner: string, id: string, path: string) {
  if (!z.uuid().safeParse(owner).success || !z.uuid().safeParse(id).success || !new RegExp(`^${owner}/${id}/[0-9a-f]{64}\\.(jpg|png|webp)$`).test(path)) throw new DraftError("IMAGE_UNAVAILABLE");
  return path;
}

async function removeAsset(context: DraftContext, id: string, path: string) {
  assetPath(context.userId, id, path);
  const bucket = context.supabase.storage.from(DRAFT_BUCKET);
  const removed = await bucket.remove([path]);
  if (removed.error) throw new DraftError("UNAVAILABLE");
  if (!removed.data?.length) {
    const name = path.split("/")[2];
    const remaining = await bucket.list(`${context.userId}/${id}`, { search: name, limit: 100 });
    if (remaining.error || remaining.data.some(file => file.name === name)) throw new DraftError("UNAVAILABLE");
  }
  const deleted = await context.supabase.from("scan_draft_assets").delete().eq("draft_id", id).eq("storage_path", path).select("storage_path");
  checked(deleted.error);
  if (!deleted.data?.length) throw new DraftError("UNAVAILABLE");
}
export async function cleanupDraft(context: DraftContext, row: ScanDraftRow) {
  if (row.user_id !== context.userId) throw new DraftError("NOT_FOUND");
  if (row.state === "saving" && row.lease_until && new Date(row.lease_until).getTime() > Date.now()) return;
  if (row.state === "active" || row.state === "saving") {
    if (new Date(row.expires_at).getTime() > Date.now()) return;
    const retired = await context.supabase.from("scan_drafts").update({ state: "discarded" }).eq("user_id", context.userId).eq("id", row.id).eq("revision", row.revision).eq("state", row.state).select("id");
    checked(retired.error);
    if (!retired.data?.length) return;
  }
  const assets = await context.supabase.from("scan_draft_assets").select("storage_path").eq("draft_id", row.id);
  checked(assets.error);
  for (const asset of assets.data ?? []) await removeAsset(context, row.id, asset.storage_path);
  const deleted = await context.supabase.from("scan_drafts").delete().eq("user_id", context.userId).eq("id", row.id).in("state", ["consumed", "discarded"]).select("id");
  checked(deleted.error);
  if (!deleted.data?.length) throw new DraftError("UNAVAILABLE");
}
export async function cleanupOwnerDrafts(context: DraftContext) {
  const rows = await context.supabase.from("scan_drafts").select("*").eq("user_id", context.userId)
    .or(`expires_at.lte.${new Date().toISOString()},state.in.(consumed,discarded)`).limit(50);
  checked(rows.error);
  for (const row of rows.data ?? []) {
    try { await cleanupDraft(context, row); } catch { console.warn("Draft cleanup deferred"); }
  }
}
async function cleanupUnusedAssets(context: DraftContext, row: ScanDraftRow) {
  const assets = await context.supabase.from("scan_draft_assets").select("storage_path")
    .eq("draft_id", row.id).lt("touched_at", new Date(Date.now() - 600_000).toISOString());
  checked(assets.error);
  for (const asset of assets.data ?? []) if (asset.storage_path !== row.front_path && asset.storage_path !== row.back_path) {
    try { await removeAsset(context, row.id, asset.storage_path); } catch { console.warn("Unused draft image cleanup deferred"); }
  }
}
export async function listDrafts(context: DraftContext) {
  await cleanupOwnerDrafts(context);
  const result = await context.supabase.from("scan_drafts").select("*").eq("user_id", context.userId)
    .in("state", ["active", "saving"]).gt("expires_at", new Date().toISOString()).order("updated_at", { ascending: false }).limit(5);
  checked(result.error);
  return (result.data ?? []).map(row => {
    const parsed = draftPayloadSchema.safeParse(row.payload);
    return { ...draftMeta(row), label: parsed.success ? parsed.data.extraction?.name || parsed.data.extraction?.company || parsed.data.frontName || parsed.data.backName || "Image draft" : "Draft requiring repair", saving: row.state === "saving" };
  });
}

async function uploadAsset(context: DraftContext, id: string, image: ExtractionImage) {
  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/png" ? "png" : "webp";
  const path = `${context.userId}/${id}/${createHash("sha256").update(image.bytes).digest("hex")}.${extension}`;
  const assets = context.supabase.from("scan_draft_assets");
  const existing = await assets.select("storage_path").eq("draft_id", id).eq("storage_path", path).maybeSingle();
  checked(existing.error);
  if (!existing.data) {
    const reserve = await context.supabase.from("scan_draft_assets").insert({ draft_id: id, storage_path: path });
    if (reserve.error?.code !== "23505") checked(reserve.error);
  }
  // Refresh the reservation before upload so another tab cannot sweep this path.
  const touch = await context.supabase.from("scan_draft_assets").update({ uploaded: false }).eq("draft_id", id).eq("storage_path", path).select("storage_path");
  checked(touch.error);
  if (!touch.data?.length) throw new DraftError("CONFLICT");
  const uploaded = await context.supabase.storage.from(DRAFT_BUCKET).upload(path, image.bytes, { upsert: false, contentType: image.mimeType });
  if (uploaded.error && !("statusCode" in uploaded.error && String(uploaded.error.statusCode) === "409")) throw new DraftError("UNAVAILABLE");
  const ready = await context.supabase.from("scan_draft_assets").update({ uploaded: true }).eq("draft_id", id).eq("storage_path", path).select("storage_path");
  checked(ready.error);
  if (!ready.data?.length) throw new DraftError("CONFLICT");
  return path;
}
export async function writeDraft(context: DraftContext, input: z.infer<typeof draftWriteSchema>, front?: ExtractionImage, back?: ExtractionImage) {
  await cleanupOwnerDrafts(context);
  let row = await findDraft(context, input.id);
  if (!row) {
    if (input.expectedRevision !== 0) throw new DraftError("NOT_FOUND");
    const created = await context.supabase.from("scan_drafts").insert({ id: input.id, user_id: context.userId });
    if (created.error?.code !== "23505") checked(created.error);
    row = await findDraft(context, input.id);
  }
  active(row);
  if (row.state !== "active") throw new DraftError("BUSY");
  if (row.revision !== input.expectedRevision) throw new DraftError("CONFLICT");
  await cleanupUnusedAssets(context, row);
  const frontPath = input.frontMode === "remove" ? null : front ? await uploadAsset(context, row.id, front) : row.front_path;
  const backPath = input.backMode === "remove" ? null : back ? await uploadAsset(context, row.id, back) : row.back_path;
  if (input.payload.extraction && (!frontPath || !!input.payload.extraction.sourceSides !== !!backPath)) throw new DraftError("INVALID_DRAFT");
  const committed = await context.supabase.from("scan_drafts").update({ payload: input.payload as Json, front_path: frontPath, back_path: backPath, revision: row.revision + 1 })
    .eq("user_id", context.userId).eq("id", row.id).eq("state", "active").eq("revision", row.revision).select("*").maybeSingle();
  checked(committed.error);
  if (!committed.data) throw new DraftError("CONFLICT");
  // A failed response leaves reservations and the prior snapshot recoverable.
  return draftMeta(committed.data);
}

async function existingCard(context: DraftContext, id: string) {
  const result = await context.supabase.from("cards").select("id").eq("user_id", context.userId).eq("id", submissionCardId(context.userId, id)).maybeSingle();
  checked(result.error);
  return result.data?.id ?? null;
}
export async function restoreDraft(context: DraftContext, id: string) {
  const saved = await existingCard(context, id);
  if (saved) return { savedCardId: saved };
  const row = await findDraft(context, id); active(row);
  const parsed = draftPayloadSchema.safeParse(row.payload);
  if (!parsed.success) throw new DraftError("INVALID_DRAFT");
  const sign = async (path: string | null) => {
    if (!path) return null;
    const result = await context.supabase.storage.from(DRAFT_BUCKET).createSignedUrl(assetPath(context.userId, id, path), 60);
    if (result.error || !result.data?.signedUrl) throw new DraftError("IMAGE_UNAVAILABLE");
    return result.data.signedUrl;
  };
  const [frontUrl, backUrl] = await Promise.all([sign(row.front_path), sign(row.back_path)]);
  return { meta: draftMeta(row), payload: parsed.data, frontUrl, backUrl };
}
export async function discardDraft(context: DraftContext, id: string, revision: number) {
  const row = await findDraft(context, id);
  if (!row) return;
  if (row.revision !== revision) throw new DraftError("CONFLICT");
  if (row.state === "active" || row.state === "saving") {
    if (row.state === "saving" && row.lease_until && new Date(row.lease_until).getTime() > Date.now()) throw new DraftError("BUSY");
    const result = await context.supabase.from("scan_drafts").update({ state: "discarded" }).eq("user_id", context.userId).eq("id", id).eq("revision", revision).eq("state", row.state).select("*").maybeSingle();
    checked(result.error);
    if (!result.data) throw new DraftError("CONFLICT");
    await cleanupDraft(context, result.data);
  } else await cleanupDraft(context, row);
}

async function downloadImage(context: DraftContext, id: string, path: string) {
  const downloaded = await context.supabase.storage.from(DRAFT_BUCKET).download(assetPath(context.userId, id, path));
  if (downloaded.error || !downloaded.data || downloaded.data.size > 10485760) throw new DraftError("IMAGE_UNAVAILABLE");
  const image = await validateOriginalImage(new File([downloaded.data], "recovered", { type: downloaded.data.type })).catch(() => { throw new DraftError("IMAGE_UNAVAILABLE"); });
  if (createHash("sha256").update(image.bytes).digest("hex") !== path.split("/")[2].split(".")[0]) throw new DraftError("IMAGE_UNAVAILABLE");
  return image;
}
export async function saveDraftCard(context: DraftContext, id: string, input: z.infer<typeof draftSaveSchema>) {
  // A committed save remains retryable even after its recovery copy is cleaned.
  const saved = await existingCard(context, id);
  if (saved) return saved;
  const row = await findDraft(context, id); active(row);
  const payload = draftPayloadSchema.safeParse(row.payload);
  if (!payload.success || !payload.data.extraction || !row.front_path) throw new DraftError("INVALID_DRAFT");
  const review = validateReviewDraft(payload.data.review ?? createReviewDraft(payload.data.extraction));
  if (!review.success || JSON.stringify(review.data) !== JSON.stringify(input.reviewedData)) throw new DraftError("CONFLICT");
  const cardId = submissionCardId(context.userId, id);
  const claimed = await context.supabase.rpc("claim_scan_draft", { p_id: id, p_revision: input.expectedRevision, p_card_id: cardId });
  checked(claimed.error);
  const snapshot = claimed.data?.[0];
  if (!snapshot || snapshot.user_id !== context.userId || snapshot.final_card_id !== cardId || snapshot.revision !== input.expectedRevision) throw new DraftError("CONFLICT");
  try {
    const confirmed = draftPayloadSchema.safeParse(snapshot.payload);
    if (!confirmed.success || !confirmed.data.extraction) throw new DraftError("INVALID_DRAFT");
    const confirmedReview = validateReviewDraft(confirmed.data.review ?? createReviewDraft(confirmed.data.extraction));
    if (!confirmedReview.success || JSON.stringify(confirmedReview.data) !== JSON.stringify(input.reviewedData)) throw new DraftError("CONFLICT");
    const image = await downloadImage(context, id, snapshot.front_path!);
    const back = snapshot.back_path ? await downloadImage(context, id, snapshot.back_path) : undefined;
    const result = await saveReviewedCard({ userId: context.userId, store: createCardSaveStore(context.supabase, context.userId) }, {
      submissionId: id, reviewConfirmed: true, aiExtraction: confirmed.data.extraction, reviewedData: input.reviewedData,
      ...(input.duplicateAcknowledgement ? { duplicateAcknowledgement: input.duplicateAcknowledgement } : {}),
    }, image, back);
    const consumed = await context.supabase.from("scan_drafts").update({ state: "consumed" }).eq("user_id", context.userId).eq("id", id).eq("state", "saving").eq("revision", snapshot.revision).select("*").maybeSingle();
    if (!consumed.error && consumed.data) {
      try { await cleanupDraft(context, consumed.data); } catch { console.warn("Consumed draft cleanup deferred"); }
    } else console.warn("Draft save receipt cleanup deferred");
    return result;
  } catch (error) {
    // Preserve an uncertain/in-flight save lease and both recovery originals.
    if (!(error instanceof SaveError) || !["SAVE_STATUS_UNKNOWN", "SAVE_IN_PROGRESS", "CLEANUP_FAILED"].includes(error.code)) {
      try {
        if (!await existingCard(context, id)) await context.supabase.from("scan_drafts").update({ state: "active", lease_until: null }).eq("user_id", context.userId).eq("id", id).eq("state", "saving").eq("revision", snapshot.revision);
      } catch { console.warn("Draft save lease retained"); }
    }
    throw error;
  }
}
