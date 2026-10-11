import { CachedCards } from "@/components/cache/cached-cards";
import type { CardListParams } from "@/lib/cards/search";
export default async function CardsPage({ searchParams }: { searchParams: Promise<CardListParams> }) { return <CachedCards params={await searchParams} />; }
