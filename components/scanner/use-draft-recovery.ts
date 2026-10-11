"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import { z } from "zod";
import { createSubmissionId, saveResponseSchema } from "@/lib/cards/save-schema";
import type { ReviewedCard } from "@/lib/cards/review";
import type { DuplicateWarning } from "@/lib/cards/duplicates";
import { draftListSchema, draftMetaSchema, draftRestoreSchema, draftMessages, DraftError, type DraftMeta, type DraftPayload } from "@/lib/drafts/schema";

export type RecoverySnapshot = { front: File | null; back: File | null; payload: DraftPayload };
type Summary = z.infer<typeof draftListSchema>["drafts"][number];
async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.enum(Object.keys(draftMessages) as [keyof typeof draftMessages, ...Array<keyof typeof draftMessages>]) }) }).safeParse(value);
    throw new DraftError(parsed.success ? parsed.data.error.code : "UNAVAILABLE");
  }
  return value;
}
export function useDraftRecovery(snapshot: RecoverySnapshot, restore: (payload: DraftPayload, front: File | null, back: File | null) => Promise<void>, paused: boolean, owner?: string) {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<RecoverySnapshot | null>(null);
  const [meta, setMeta] = useState<DraftMeta | null>(null);
  const [drafts, setDrafts] = useState<Summary[]>([]);
  const [status, setStatus] = useState("Recovery off");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const current = useRef(snapshot);
  const identity = useRef<DraftMeta | null>(null);
  const last = useRef<RecoverySnapshot | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const finished = useRef(false);
  const blocked = useRef(false);
  const alive = useRef(true);
  useEffect(() => { current.current = snapshot; }, [snapshot]);
  const report = useCallback((failure: unknown) => {
    const message = failure instanceof Error && Object.values(draftMessages).some(text => text === failure.message) ? failure.message : draftMessages.UNAVAILABLE;
    if (failure instanceof DraftError && ["CONFLICT", "BUSY", "NOT_FOUND"].includes(failure.code)) blocked.current = true;
    if (alive.current) { setError(message); setStatus("Recovery not saved"); }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const value = draftListSchema.parse(await body(await fetch("/api/drafts", { headers: owner ? { "X-Draft-Owner": owner } : undefined, cache: "no-store", signal: AbortSignal.timeout(30000) })));
      if (alive.current) setDrafts(value.drafts);
    } catch (failure) { report(failure); }
  }, [report, owner]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(timer); alive.current = false; };
  }, [refresh]);

  const flush = useCallback(() => {
    const operation = chain.current.then(async () => {
      if (finished.current) return;
      if (blocked.current) throw new DraftError("CONFLICT");
      const value = current.current;
      const previous = last.current;
      if (previous && previous.front === value.front && previous.back === value.back && JSON.stringify(previous.payload) === JSON.stringify(value.payload)) return;
      const id = identity.current ?? { id: createSubmissionId(), revision: 0, expiresAt: "", updatedAt: "" };
      identity.current = id; // Keep the same identity when the response is uncertain.
      if (alive.current) { setStatus("Saving recovery…"); setError(null); }
      const mode = (file: File | null, old: File | null | undefined) => !file ? "remove" : file === old ? "keep" : "replace";
      const frontMode = mode(value.front, previous?.front), backMode = mode(value.back, previous?.back);
      const form = new FormData();
      form.append("data", JSON.stringify({ id: id.id, expectedRevision: id.revision, payload: value.payload, frontMode, backMode }));
      if (frontMode === "replace" && value.front) form.append("image", value.front);
      if (backMode === "replace" && value.back) form.append("backImage", value.back);
      const parsed = z.object({ meta: draftMetaSchema }).parse(await body(await fetch("/api/drafts", { method: "POST", headers: owner ? { "X-Draft-Owner": owner } : undefined, body: form, signal: AbortSignal.timeout(60000) })));
      identity.current = parsed.meta; last.current = value;
      if (alive.current) { setMeta(parsed.meta); setSavedSnapshot(value); setStatus("Recovery saved"); setError(null); }
    });
    chain.current = operation.catch(() => {});
    return operation;
  }, [owner]);
  useEffect(() => {
    if (!enabled || paused || working || finished.current || blocked.current) return;
    const timer = setTimeout(() => { void flush().catch(report); }, 1500);
    return () => clearTimeout(timer);
  }, [snapshot, enabled, paused, working, flush, report]);
  useEffect(() => {
    if (!enabled) return;
    const warn = (event: BeforeUnloadEvent) => {
      const previous = last.current, value = current.current;
      if (!previous || previous.front !== value.front || previous.back !== value.back || JSON.stringify(previous.payload) !== JSON.stringify(value.payload)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);
  async function run(action: () => Promise<void>) {
    setWorking(true); setError(null);
    try { await action(); } catch (failure) { report(failure); } finally { if (alive.current) setWorking(false); }
  }
  async function resume(id: string) {
    if ((current.current.front || current.current.back) && !window.confirm(t("Replace the current scan with this recovery draft? Unsaved current edits will be lost."))) return;
    await run(async () => {
      await chain.current;
      const restored = draftRestoreSchema.parse(await body(await fetch(`/api/drafts/${id}`, { headers: owner ? { "X-Draft-Owner": owner } : undefined, cache: "no-store", signal: AbortSignal.timeout(30000) })));
      if ("savedCardId" in restored) { setSavedCardId(restored.savedCardId); return; }
      const download = async (url: string | null, name: string | null) => {
        if (!url) return null;
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new DraftError("IMAGE_UNAVAILABLE");
        const blob = await response.blob();
        if (blob.size > 10485760) throw new DraftError("IMAGE_UNAVAILABLE");
        return new File([blob], name || "recovered-card", { type: blob.type });
      };
      const [front, back] = await Promise.all([download(restored.frontUrl, restored.payload.frontName), download(restored.backUrl, restored.payload.backName)]);
      await restore(restored.payload, front, back);
      identity.current = restored.meta; last.current = { front, back, payload: restored.payload };
      blocked.current = false; finished.current = false;
      setMeta(restored.meta); setSavedSnapshot({ front, back, payload: restored.payload }); setEnabled(true); setStatus("Recovery saved"); setError(null);
    });
  }
  async function discard(id: string, revision: number) {
    await run(async () => {
      await chain.current;
      const latest = identity.current?.id === id ? identity.current.revision : revision;
      await body(await fetch(`/api/drafts/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json", ...(owner ? { "X-Draft-Owner": owner } : {}) }, body: JSON.stringify({ expectedRevision: latest }), signal: AbortSignal.timeout(60000) }));
      if (identity.current?.id === id) { identity.current = null; last.current = null; blocked.current = false; setEnabled(false); setMeta(null); setSavedSnapshot(null); setStatus("Recovery off"); }
      await refresh();
    });
  }
  async function save(data: ReviewedCard, warning: DuplicateWarning | null) {
    await flush().catch(failure => { report(failure); throw failure; });
    const id = identity.current;
    if (!id) throw new DraftError("UNAVAILABLE");
    const response = await fetch(`/api/drafts/${id.id}/save`, { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "X-Draft-Owner": owner } : {}) }, body: JSON.stringify({ expectedRevision: id.revision, reviewConfirmed: true, reviewedData: data, ...(warning ? { duplicateAcknowledgement: { confirmed: true, fingerprint: warning.fingerprint } } : {}) }), signal: AbortSignal.timeout(90000) });
    const parsed = saveResponseSchema.safeParse(await response.clone().json());
    if (!parsed.success) await body(response.clone()).catch(failure => { report(failure); throw failure; });
    if (parsed.success && parsed.data.success && response.ok) { finished.current = true; setEnabled(false); }
    return response;
  }
  const displayedStatus = enabled && status === "Recovery saved" && (!savedSnapshot || savedSnapshot.front !== snapshot.front || savedSnapshot.back !== snapshot.back || JSON.stringify(savedSnapshot.payload) !== JSON.stringify(snapshot.payload)) ? "Recovery pending" : status;
  return { enabled, meta, drafts, status: displayedStatus, error, working, savedCardId, refresh,
    enable: () => { setError(null); setEnabled(true); setStatus("Recovery pending"); },
    saveNow: () => run(flush), resume, discard, save };
}
