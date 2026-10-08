import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getCardList } from "@/lib/cards/card-detail";
import { SavedCardImage } from "@/components/cards/saved-card-image";
import { Button } from "@/components/ui/button";
import { CardSearch } from "@/components/cards/card-search";
import { cardListHref, parseCardListParams, type CardListParams } from "@/lib/cards/search";

export default async function CardsPage({ searchParams }: { searchParams: Promise<CardListParams> }) {
  const { user, supabase } = await requireUser();
  const { query, archived, page, error } = parseCardListParams(await searchParams);
  const { cards, hasNext } = error ? { cards: [], hasNext: false } : await getCardList(supabase, user.id, archived, page, query);
  const href = (value: number) => cardListHref(query, archived, value);
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{archived ? "Archived cards" : "Your cards"}</h1><p className="mt-2 text-sm text-muted-foreground">{archived ? "Keep cards here until you need them again." : "Find a contact or open a card to review its details."}</p></div>
      <Button asChild><Link href="/scan">Scan a card</Link></Button>
    </div>
    <nav aria-label="Card status" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:w-fit">
      <Link href={cardListHref(query, false)} aria-current={!archived ? "page" : undefined} className="rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors hover:text-primary aria-[current=page]:bg-card aria-[current=page]:text-primary aria-[current=page]:shadow-sm focus-visible:outline-2 focus-visible:outline-ring">Active cards</Link>
      <Link href={cardListHref(query, true)} aria-current={archived ? "page" : undefined} className="rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors hover:text-primary aria-[current=page]:bg-card aria-[current=page]:text-primary aria-[current=page]:shadow-sm focus-visible:outline-2 focus-visible:outline-ring">Archived cards</Link>
    </nav>
    <CardSearch key={`${archived}-${query}-${error ?? ""}`} query={query} archived={archived} />
    {error && <p role="alert" className="rounded-lg border border-destructive p-3">Unable to search: {error} Enter a new query above.</p>}
    {cards.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(card => <li key={card.id} className="min-w-0">
        <Link href={`/cards/${card.id}`} aria-label={`Open ${card.name || card.company || "untitled card"}`} className="group block h-full cursor-pointer space-y-3 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {card.imageUrl && <SavedCardImage key={card.imageUrl} url={card.imageUrl} compact />}
        <h2 className="break-words text-lg font-semibold" dir="auto">{card.name || card.company || "Untitled card"}</h2>
        <dl className="space-y-2 text-sm">
          {[["Company", card.company], ["Job title", card.job_title], ["Phone", card.phone], ["Email", card.email]].map(([label, value]) => value && <div key={label}><dt className="text-muted-foreground">{label}</dt><dd dir="auto" className="break-words">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted-foreground">Created <time dateTime={card.created_at}>{new Date(card.created_at).toLocaleDateString("en", { timeZone: "Asia/Phnom_Penh" })}</time></p>        </Link>
      </li>)}
    </ul> : !error && <div className="space-y-3 rounded-xl border bg-card p-6 text-center sm:p-10">
      <p role="status">{query ? `No ${archived ? "archived" : "active"} cards ${page > 1 ? "on this page " : ""}match “${query}”.` : page > 1 ? "No cards on this page." : archived ? "You have no archived cards." : "You have no saved cards yet. Scan a card and review its information to get started."}</p>
      {query && <><p className="text-sm text-muted-foreground">Try a shorter keyword, check the spelling, or switch between active and archived cards.</p><Link href={cardListHref("", archived)} className="inline-block rounded py-3 underline focus-visible:outline-2">Clear search and show {archived ? "archived" : "active"} cards</Link></>}
      {!query && !archived && page === 1 && <Button asChild><Link href="/scan">Scan your first card</Link></Button>}
    </div>}
    {!error && <nav aria-label="Card list pages" className="flex items-center gap-4">
      {page > 1 && <Link href={href(page - 1)} className="rounded py-3 underline focus-visible:outline-2">Previous page</Link>}
      <span className="text-sm">Page {page}</span>
      {hasNext && <Link href={href(page + 1)} className="rounded py-3 underline focus-visible:outline-2">Next page</Link>}
    </nav>}
  </section>;
}
