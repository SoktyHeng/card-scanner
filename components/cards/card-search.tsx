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
  const [pendingAction, setPendingAction] = useState<"search" | "clear">("search");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = cardSearchQuerySchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError(null);
    setPendingAction("search");
    startTransition(() => navigate(cardListHref(parsed.data, archived)));
  }
  function clear() {
    setDraft(""); setError(null);
    setPendingAction("clear");
    startTransition(() => navigate(cardListHref("", archived)));
  }
  return <form action="/cards" method="get" role="search" aria-label="Search your cards" aria-busy={pending} onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
    <Label htmlFor={id}>Search cards</Label>
    <input type="hidden" name="status" value={archived ? "archived" : "active"} />
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input id={id} name="q" type="search" value={draft} maxLength={MAX_SEARCH_LENGTH} dir="auto" enterKeyHint="search"
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={!!error}
        placeholder="Name, company, phone, email…" className="min-w-0 flex-1"
        onChange={event => { setDraft(event.target.value); setError(null); }} />
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <Button type="submit" disabled={pending} loading={pending && pendingAction === "search"}>{pending && pendingAction === "search" ? "Searching…" : "Search"}</Button>
        <Button type="button" variant="outline" disabled={pending || (!draft && !query)} loading={pending && pendingAction === "clear"} onClick={clear}>Clear search</Button>
      </div>
    </div>
    <p id={`${id}-help`} className="text-sm text-muted-foreground">Find a name, company, phone, email, job title or card number.</p>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" aria-live="polite" aria-atomic="true" className={pending ? "text-sm text-muted-foreground" : "sr-only"}>{pending ? "Searching your cards…" : ""}</p>
  </form>;
}
