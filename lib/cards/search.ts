import { z } from "zod";

export const MAX_SEARCH_LENGTH = 200;
export const cardSearchQuerySchema = z.string().trim().max(MAX_SEARCH_LENGTH, "Use 200 characters or fewer.")
  .regex(/^[^\u0000-\u001f\u007f]*$/, "Remove control characters from your search.");
const pageSchema = z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).refine(page => page <= 100000);
export type CardListParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] };
export function parseCardListParams(params: CardListParams) {
  const parsedQuery = cardSearchQuerySchema.safeParse(params.q ?? "");
  const parsedPage = pageSchema.safeParse(params.page ?? "1");
  return {
    query: parsedQuery.success ? parsedQuery.data : "",
    error: parsedQuery.success ? null : parsedQuery.error.issues[0].message,
    archived: params.status === "archived",
    page: parsedPage.success ? parsedPage.data : 1,
  };
}
export function cardListHref(query: string, archived: boolean, page = 1) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (archived) params.set("status", "archived");
  if (page > 1) params.set("page", String(page));
  const encoded = params.toString();
  return `/cards${encoded ? `?${encoded}` : ""}`;
}
