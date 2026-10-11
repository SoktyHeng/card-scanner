"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/i18n/language-provider";
import { organizationSchema, tagNameSchema, MAX_CARD_TAGS, MAX_NOTES_LENGTH } from "@/lib/cards/organization-schema";
import { cardOperation } from "./card-operation";

type Props = {id: string; updatedAt: string; notes: string; favorite: boolean; tags: string[]};
export function CardOrganization({id, updatedAt, notes, favorite, tags}: Props) {
  const {t, number} = useLanguage();
  // Keep edits and the original revision during background cache refreshes.
  const [draft, setDraft] = useState({notes, favorite, tags, expectedUpdatedAt: updatedAt});
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const tagInput = useRef<HTMLInputElement>(null);
  function feedback(text: string) {setError(text); queueMicrotask(() => alert.current?.focus());}
  function addTag() {
    const result = tagNameSchema.safeParse(newTag);
    if (!result.success) {feedback(result.error.issues[0].message); return;}
    if (draft.tags.some(tag => tag.normalize().toLowerCase() === result.data.toLowerCase())) {feedback("This tag is already added."); return;}
    if (draft.tags.length >= MAX_CARD_TAGS) {feedback("Use at most 20 tags."); return;}
    setDraft({...draft, tags: [...draft.tags, result.data]}); setNewTag(""); setError(null); setMessage(null); tagInput.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (newTag.trim()) {feedback("Add the entered tag or clear it before saving."); return;}
    const result = organizationSchema.safeParse({operation: "organize", ...draft});
    if (!result.success) {feedback(result.error.issues[0].message); return;}
    busy.current = true; setPending(true); setError(null); setMessage(null);
    try {
      const saved = await cardOperation(id, "PATCH", result.data);
      if (!saved.updatedAt) throw new Error("Unable to complete this operation. Reload to check its status before retrying.");
      setDraft({...draft, expectedUpdatedAt: saved.updatedAt});
      setMessage("Organization saved.");
    } catch (failure) {feedback(failure instanceof Error ? failure.message : "Unable to save organization. Please try again.");}
    finally {busy.current = false; setPending(false);}
  }
  return <section aria-labelledby="organization-heading" className="space-y-4 rounded-xl border p-4">
    <h2 id="organization-heading" className="text-lg font-semibold">{t("Organize this card")}</h2>
    <p className="text-sm text-muted-foreground">{t("Notes, tags and favorites are private and separate from the original scan. Archive and restore keep them.")}</p>
    <form onSubmit={save} noValidate className="space-y-4">
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <Label className="flex items-center gap-2"><input type="checkbox" checked={draft.favorite} onChange={event => {setDraft({...draft, favorite: event.target.checked}); setMessage(null);}} className="size-5"/>{t("Favorite")}</Label>
        <div className="space-y-2"><Label htmlFor="card-notes">{t("Personal notes")}</Label>
          <textarea id="card-notes" dir="auto" rows={5} maxLength={MAX_NOTES_LENGTH} value={draft.notes} onChange={event => {setDraft({...draft, notes: event.target.value}); setMessage(null);}} className="w-full rounded-lg border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-ring"/>
          <p className="text-xs text-muted-foreground">{t("{count} of {limit} characters", {count: number(draft.notes.length), limit: number(MAX_NOTES_LENGTH)})}</p>
        </div>
        <fieldset className="min-w-0 space-y-3"><legend className="font-medium">{t("Tags")}</legend>
          {draft.tags.length ? <ul className="flex flex-wrap gap-2">{draft.tags.map(tag => <li key={tag} className="flex max-w-full items-center gap-2 rounded-lg border p-2"><span className="break-words" dir="auto">{tag}</span><Button type="button" variant="ghost" aria-label={t("Remove tag {name}",{name: tag})} onClick={() => {setDraft({...draft, tags: draft.tags.filter(value => value !== tag)}); setMessage(null);}}>×</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("No tags yet.")}</p>}
          <div className="space-y-2"><Label htmlFor="new-card-tag">{t("Tag name")}</Label><div className="flex flex-wrap gap-2"><Input ref={tagInput} id="new-card-tag" dir="auto" maxLength={50} value={newTag} onChange={event => setNewTag(event.target.value)} className="min-w-0 flex-1" onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); addTag();}}}/><Button type="button" variant="outline" onClick={addTag} disabled={draft.tags.length >= MAX_CARD_TAGS}>{t("Add tag")}</Button></div></div>
          <p className="text-xs text-muted-foreground">{t("Up to 20 tags per card. Tag names ignore case; use the same name to reuse a tag.")}</p>
        </fieldset>
        <Button type="submit" loading={pending}>{t(pending ? "Saving organization…" : "Save organization")}</Button>
      </fieldset>
      {error && <p ref={alert} tabIndex={-1} role="alert" className="rounded text-sm text-destructive focus-visible:outline-2">{t(error)}</p>}
      <p role="status" aria-live="polite" className="text-sm">{message ? t(message) : t("Choose Save organization to keep these changes.")}</p>
    </form>
  </section>;
}
