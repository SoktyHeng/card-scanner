"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Link from "next/link";
import { useWorkspaceData } from "@/components/cache/workspace-cache";
import { CardListSkeleton } from "@/components/cards/card-skeletons";
import { CacheReadError } from "@/components/cache/read-error";
import type { getCardList } from "@/lib/cards/card-detail";
import { SavedCardImage } from "@/components/cards/saved-card-image";
import { Button } from "@/components/ui/button";
import { CardSearch } from "@/components/cards/card-search";
import { cardListHref, parseCardListParams, type CardListParams } from "@/lib/cards/search";
export function CachedCards({ params }: {
    params: CardListParams;
}) {
    const { date, number, t } = useLanguage();
    const { query, archived, page, error, filters } = parseCardListParams(params);
    const key = "type=cards&" + (cardListHref(query, archived, page, filters).split("?")[1] ?? "");
    const read = useWorkspaceData<Awaited<ReturnType<typeof getCardList>>>(key, 45000, true, !error);
    if (!error && read.error)
        return <CacheReadError retry={read.retry}/>;
    if (!error && !read.data)
        return <CardListSkeleton />;
    const { cards, hasNext } = read.data ?? { cards: [], hasNext: false };
    const hasFilters = !!(filters.cardType || filters.company || filters.from || filters.to);
    const href = (value: number) => cardListHref(query, archived, value, filters);
    return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{archived ? <T text={"Archived cards"}/> : <T text={"Your cards"}/>}</h1><p className="mt-2 text-sm text-muted-foreground">{archived ? <T text={"Keep cards here until you need them again."}/> : <T text={"Find a contact or open a card to review its details."}/>}</p></div>
      <Button asChild><Link href="/scan"><T text={"Scan a card"}/></Link></Button>
    </div>
    <nav aria-label={t("Card status")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:w-fit">
      <Link href={cardListHref(query, false, 1, filters)} aria-current={!archived ? "page" : undefined} className="rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors hover:text-primary aria-[current=page]:bg-card aria-[current=page]:text-primary aria-[current=page]:shadow-sm focus-visible:outline-2 focus-visible:outline-ring"><T text={"Active cards"}/></Link>
      <Link href={cardListHref(query, true, 1, filters)} aria-current={archived ? "page" : undefined} className="rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors hover:text-primary aria-[current=page]:bg-card aria-[current=page]:text-primary aria-[current=page]:shadow-sm focus-visible:outline-2 focus-visible:outline-ring"><T text={"Archived cards"}/></Link>
    </nav>
    <CardSearch key={`${archived}-${query}-${JSON.stringify(filters)}-${error ?? ""}`} query={query} archived={archived} filters={filters}/>
    {error && <p role="alert" className="rounded-lg border border-destructive p-3"><T text={"Unable to apply search or filters: "}/>{<T text={error}/>}<T text={" Correct the controls above or reset them."}/></p>}
    {cards.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(card => <li key={card.id} className="min-w-0">
        <Link href={`/cards/${card.id}`} aria-label={t("Open {name}", {name: card.name || card.company || t("Untitled card")})} className="group block h-full cursor-pointer space-y-3 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {card.imageUrl && <SavedCardImage key={card.imageUrl} url={card.imageUrl} compact/>}
        <h2 className="break-words text-lg font-semibold" dir="auto">{card.name || card.company || <T text={"Untitled card"}/>}</h2>
        <dl className="space-y-2 text-sm">
          {[["Company", card.company], ["Job title", card.job_title], ["Phone", card.phone], ["Email", card.email]].map(([label, value]) => value && <div key={label}><dt className="text-muted-foreground">{<T text={label ?? ""}/>}</dt><dd dir="auto" className="break-words">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted-foreground"><T text={"Created "}/><time dateTime={card.created_at}>{date(card.created_at, { timeZone: "Asia/Phnom_Penh" })}</time></p>        </Link>
      </li>)}
    </ul> : !error && <div className="space-y-3 rounded-xl border bg-card p-6 text-center sm:p-10">
      <p role="status">{hasFilters ? t("No {status} cards match these filters{search}{page}.", {status: t(archived ? "archived" : "active"), search: query ? t(" and search") : "", page: page > 1 ? t(" on this page") : ""}) : query ? t("No {status} cards {page}match “{query}”.", {status: t(archived ? "archived" : "active"), page: page > 1 ? t("on this page ") : "", query}) : page > 1 ? <T text={"No cards on this page."}/> : archived ? <T text={"You have no archived cards."}/> : <T text={"You have no saved cards yet. Scan a card and review its information to get started."}/>}</p>
      {(query || hasFilters) && <><p className="text-sm text-muted-foreground"><T text={"Try a shorter keyword, adjust the filters, or switch between active and archived cards."}/></p><Link href={cardListHref("", archived)} className="inline-block rounded py-3 underline focus-visible:outline-2"><T text="Reset search and filters and show {status} cards" parameters={{status: t(archived ? "archived" : "active")}}/></Link></>}
      {!query && !hasFilters && !archived && page === 1 && <Button asChild><Link href="/scan"><T text={"Scan your first card"}/></Link></Button>}
    </div>}
    {!error && <nav aria-label={t("Card list pages")} className="flex items-center gap-4">
      {page > 1 && <Link href={href(page - 1)} className="rounded py-3 underline focus-visible:outline-2"><T text={"Previous page"}/></Link>}
      <span className="text-sm"><T text={"Page "}/>{number(page)}</span>
      {hasNext && <Link href={href(page + 1)} className="rounded py-3 underline focus-visible:outline-2"><T text={"Next page"}/></Link>}
    </nav>}
  </section>;
}
