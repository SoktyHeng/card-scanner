import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getCardList } from "@/lib/cards/card-detail";
import { SavedCardImage } from "@/components/cards/saved-card-image";
import { Button } from "@/components/ui/button";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const { user, supabase } = await requireUser();
  const query = await searchParams;
  const archived = query.status === "archived";
  const parsed = Number(query.page);
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : 1;
  const { cards, hasNext } = await getCardList(supabase, user.id, archived, page);
  const href = (value: number) => `/cards?status=${archived ? "archived" : "active"}&page=${value}`;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold">{archived ? "Archived cards" : "Your cards"}</h1>
      <Button asChild><Link href="/scan">Scan a card</Link></Button>
    </div>
    <nav aria-label="Card status" className="flex gap-4">
      <Link href="/cards" aria-current={!archived ? "page" : undefined} className="rounded py-3 underline focus-visible:outline-2">Active cards</Link>
      <Link href="/cards?status=archived" aria-current={archived ? "page" : undefined} className="rounded py-3 underline focus-visible:outline-2">Archived cards</Link>
    </nav>
    {cards.length ? <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(card => <li key={card.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
        {card.imageUrl && <SavedCardImage key={card.imageUrl} url={card.imageUrl} compact />}
        <h2 className="break-words text-lg font-semibold" dir="auto"><Link href={`/cards/${card.id}`} className="rounded underline-offset-4 hover:underline focus-visible:outline-2">{card.name || card.company || "Untitled card"}</Link></h2>
        <dl className="space-y-2 text-sm">
          {[["Company", card.company], ["Job title", card.job_title], ["Phone", card.phone], ["Email", card.email]].map(([label, value]) => value && <div key={label}><dt className="text-muted-foreground">{label}</dt><dd dir="auto" className="break-words">{value}</dd></div>)}
        </dl>
        <p className="text-xs text-muted-foreground">Created <time dateTime={card.created_at}>{new Date(card.created_at).toLocaleDateString("en", { timeZone: "Asia/Phnom_Penh" })}</time></p>
        <Link href={`/cards/${card.id}`} aria-label={`Open ${card.name || card.company || "untitled card"}`} className="inline-block rounded py-3 text-sm underline focus-visible:outline-2">Open card</Link>
      </li>)}
    </ul> : <div className="rounded-xl border p-6"><p>{page > 1 ? "No cards on this page." : archived ? "You have no archived cards." : "You have no saved cards yet. Scan a card and review its information to get started."}</p></div>}
    <nav aria-label="Card list pages" className="flex items-center gap-4">
      {page > 1 && <Link href={href(page - 1)} className="rounded py-3 underline focus-visible:outline-2">Previous page</Link>}
      <span className="text-sm">Page {page}</span>
      {hasNext && <Link href={href(page + 1)} className="rounded py-3 underline focus-visible:outline-2">Next page</Link>}
    </nav>
  </section>;
}
