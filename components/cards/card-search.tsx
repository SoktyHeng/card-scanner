"use client";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardListHref, cardSearchQuerySchema, MAX_SEARCH_LENGTH } from "@/lib/cards/search";

export function CardSearch({ query, archived }: { query: string; archived: boolean }) {
  const router = useRouter();
  return <CardSearchForm query={query} archived={archived} navigate={href => router.push(href)} />;
}
// Native GET form keeps URLs shareable and works before client hydration.
export function CardSearchForm({ query, archived, navigate }: { query: string; archived: boolean; navigate: (href: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(query);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = cardSearchQuerySchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError(null);
    startTransition(() => navigate(cardListHref(parsed.data, archived)));
  }
  function clear() {
    setDraft(""); setError(null);
    startTransition(() => navigate(cardListHref("", archived)));
  }
  return <form action="/cards" method="get" role="search" aria-label="Search your cards" onSubmit={submit} className="space-y-2">
    <Label htmlFor={id}>Search cards</Label>
    <input type="hidden" name="status" value={archived ? "archived" : "active"} />
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input id={id} name="q" type="search" value={draft} maxLength={MAX_SEARCH_LENGTH} dir="auto" enterKeyHint="search"
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
        placeholder="Name, company, phone, email…" className="min-w-0 flex-1"
        onChange={event => { setDraft(event.target.value); setError(null); }} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</Button>
        <Button type="button" variant="outline" disabled={pending || (!draft && !query)} onClick={clear}>Clear search</Button>
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">Search name, company, phone, email, job title or card number. Punctuation is matched exactly.</p>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" aria-live="polite" aria-atomic="true" className={pending ? "text-sm text-muted-foreground" : "sr-only"}>{pending ? "Searching your cards…" : ""}</p>
  </form>;
}
