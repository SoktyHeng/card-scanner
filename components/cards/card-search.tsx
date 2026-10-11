"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardListHref, cardSearchQuerySchema, cardListFiltersSchema, DEFAULT_CARD_FILTERS, CARD_SORTS, MAX_SEARCH_LENGTH, type CardListFilters } from "@/lib/cards/search";
export function CardSearch({ query, archived, filters = DEFAULT_CARD_FILTERS }: {
    query: string;
    archived: boolean;
    filters?: CardListFilters;
}) {
    const router = useRouter();
    return <CardSearchForm query={query} archived={archived} filters={filters} navigate={href => router.push(href)}/>;
}
// Native GET form keeps URLs shareable and works before client hydration.
export function CardSearchForm({ query, archived, filters = DEFAULT_CARD_FILTERS, navigate }: {
    query: string;
    archived: boolean;
    filters?: CardListFilters;
    navigate: (href: string) => void;
}) {
    const { t } = useLanguage();
    const id = useId();
    const [draft, setDraft] = useState(query);
    const [draftFilters, setDraftFilters] = useState(filters);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [pendingAction, setPendingAction] = useState<"search" | "clear">("search");
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending)
            return;
        const parsed = cardSearchQuerySchema.safeParse(draft);
        if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
        }
        const parsedFilters = cardListFiltersSchema.safeParse(draftFilters);
        if (!parsedFilters.success) {
            setError(parsedFilters.error.issues[0].message);
            return;
        }
        setError(null);
        setPendingAction("search");
        startTransition(() => navigate(cardListHref(parsed.data, archived, 1, parsedFilters.data)));
    }
    function clear() {
        setDraft("");
        setError(null);
        setDraftFilters(filters);
        setPendingAction("clear");
        startTransition(() => navigate(cardListHref("", archived, 1, filters)));
    }
    return <form action="/cards" method="get" role="search" aria-label={t("Search your cards")} aria-busy={pending} onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
    <Label htmlFor={id}><T text={"Search cards"}/></Label>
    <input type="hidden" name="status" value={archived ? "archived" : "active"}/>
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input id={id} name="q" type="search" value={draft} maxLength={MAX_SEARCH_LENGTH} dir="auto" enterKeyHint="search" aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={!!error} placeholder={t("Name, company, phone, email…")} className="min-w-0 flex-1" onChange={event => { setDraft(event.target.value); setError(null); }}/>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <Button type="submit" disabled={pending} loading={pending && pendingAction === "search"}>{pending && pendingAction === "search" ? <T text={"Searching…"}/> : <T text={"Search"}/>}</Button>
        <Button type="button" variant="outline" disabled={pending || (!draft && !query)} loading={pending && pendingAction === "clear"} onClick={clear}><T text={"Clear search"}/></Button>
      </div>
    </div>
    <p id={`${id}-help`} className="text-sm text-muted-foreground"><T text={"Find a name, company, phone, email, job title or card number."}/></p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {([["cardType", "Card type (exact)", "business_card"], ["company", "Company (exact)", "Company as saved"]] as const).map(([key, label, placeholder]) => <div key={key} className="space-y-2">
        <Label htmlFor={`${id}-${key}`}>{<T text={label}/>}</Label>
        <Input id={`${id}-${key}`} name={key} value={draftFilters[key]} placeholder={t(placeholder)} maxLength={MAX_SEARCH_LENGTH} dir="auto" disabled={pending} onChange={event => { setDraftFilters({ ...draftFilters, [key]: event.target.value }); setError(null); }}/>
      </div>)}
      {([["from", "Created from"], ["to", "Created through"]] as const).map(([key, label]) => <div key={key} className="space-y-2">
        <Label htmlFor={`${id}-${key}`}>{<T text={label}/>}</Label>
        <Input id={`${id}-${key}`} name={key} type="date" min="1000-01-01" max="9998-12-31" value={draftFilters[key]} disabled={pending} aria-describedby={`${id}-filters-help`} onChange={event => { setDraftFilters({ ...draftFilters, [key]: event.target.value }); setError(null); }}/>
      </div>)}
      <div className="space-y-2">
        <Label htmlFor={`${id}-sort`}><T text={"Sort cards"}/></Label>
        <select id={`${id}-sort`} name="sort" value={draftFilters.sort} disabled={pending} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" onChange={event => setDraftFilters({ ...draftFilters, sort: event.target.value as CardListFilters["sort"] })}>
          {Object.entries(CARD_SORTS).map(([value, label]) => <option key={value} value={value}>{<T text={label}/>}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor={`${id}-tag`}>{t("Tag (exact name)")}</Label><Input id={`${id}-tag`} name="tag" maxLength={50} dir="auto" value={draftFilters.tag ?? ""} disabled={pending} onChange={event => {setDraftFilters({...draftFilters, tag: event.target.value}); setError(null);}}/></div>
      <div className="space-y-2"><Label htmlFor={`${id}-favorites`}>{t("Favorites")}</Label><select id={`${id}-favorites`} name="favorites" value={draftFilters.favorites ?? ""} disabled={pending} onChange={event => setDraftFilters({...draftFilters, favorites: event.target.value as "" | "1"})} className="min-h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring"><option value="">{t("All cards")}</option><option value="1">{t("Favorites only")}</option></select></div>
    </div>
    <p id={`${id}-filters-help`} className="text-sm text-muted-foreground"><T text={"Type and company match exact saved values, including case. Dates include both selected days in Cambodia time (UTC+7). Cards without names appear last when sorting by name. Press Search to apply."}/></p>
    <Link href={cardListHref("", archived)} className="inline-block rounded py-3 text-sm underline focus-visible:outline-2"><T text={"Reset search, filters and sorting"}/></Link>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{<T text={error}/>}</p>}
    <p role="status" aria-live="polite" aria-atomic="true" className={pending ? "text-sm text-muted-foreground" : "sr-only"}>{pending ? <T text={"Searching your cards…"}/> : ""}</p>
  </form>;
}
