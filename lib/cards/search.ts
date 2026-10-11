import { z } from "zod";
import { cambodiaDayBounds } from "@/lib/utils/cambodia-time";

export const MAX_SEARCH_LENGTH = 200;
export const cardSearchQuerySchema = z.string().trim().max(MAX_SEARCH_LENGTH, "Use 200 characters or fewer.")
  .regex(/^[^\u0000-\u001f\u007f]*$/, "Remove control characters from your search.");
const pageSchema = z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).refine(page => page <= 100000);
const dateSchema = z.union([z.literal(""), z.iso.date().refine(value => value >= "1000-01-01" && value <= "9998-12-31", "Use a date between 1000 and 9998.")]);
export const CARD_SORTS = { newest: "Newest first", oldest: "Oldest first", name_asc: "Name A–Z", name_desc: "Name Z–A" } as const;
export const cardListFiltersSchema = z.object({
  cardType: cardSearchQuerySchema.default(""),
  company: cardSearchQuerySchema.default(""),
  from: dateSchema.default(""),
  to: dateSchema.default(""),
  sort: z.enum(["newest", "oldest", "name_asc", "name_desc"]).default("newest"),
}).refine(value => !value.from || !value.to || value.from <= value.to, { message: "Start date must be on or before end date.", path: ["to"] });
export type CardListFilters = z.infer<typeof cardListFiltersSchema>;
export const DEFAULT_CARD_FILTERS: CardListFilters = { cardType: "", company: "", from: "", to: "", sort: "newest" };
export type CardListParams = { q?: string | string[]; status?: string | string[]; page?: string | string[]; cardType?: string | string[]; company?: string | string[]; from?: string | string[]; to?: string | string[]; sort?: string | string[] };
export function parseCardListParams(params: CardListParams) {
  const parsedQuery = cardSearchQuerySchema.safeParse(params.q ?? "");
  const parsedPage = pageSchema.safeParse(params.page ?? "1");
  const filters = cardListFiltersSchema.safeParse({ cardType: params.cardType, company: params.company, from: params.from, to: params.to, sort: params.sort });
  const status = z.enum(["active", "archived"]).safeParse(params.status ?? "active");
  return {
    query: parsedQuery.success ? parsedQuery.data : "",
    error: !parsedQuery.success ? parsedQuery.error.issues[0].message : !filters.success ? filters.error.issues[0].message : !status.success ? "Choose active or archived cards." : null,
    archived: params.status === "archived",
    page: parsedPage.success ? parsedPage.data : 1,
    filters: filters.success ? filters.data : DEFAULT_CARD_FILTERS,
  };
}
export function cardListHref(query: string, archived: boolean, page = 1, filters: CardListFilters = DEFAULT_CARD_FILTERS) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (archived) params.set("status", "archived");
  for (const key of ["cardType", "company", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const encoded = params.toString();
  return `/cards${encoded ? `?${encoded}` : ""}`;
}
// Inclusive Cambodia calendar days, expressed as UTC timestamps for PostgreSQL.
export function cardDateBounds(filters: CardListFilters) {
  return { from: filters.from ? cambodiaDayBounds(filters.from).from : null,
    until: filters.to ? cambodiaDayBounds(filters.to).until : null };
}
