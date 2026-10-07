import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ReviewedCard } from "./review";
import { hasDuplicateSignals, matchDuplicate, type DuplicateInput, type DuplicateMatch } from "./duplicates";

const CANDIDATES_PER_PAGE = 200;
export async function findDuplicateCards(supabase: SupabaseClient<Database>, userId: string, input: DuplicateInput, excludedId: string): Promise<DuplicateMatch[]> {
  if (!hasDuplicateSignals(input)) return [];
  const matches: DuplicateMatch[] = [];
  let cursor: string | null = null;
  // Keyset paging checks every owner card, beyond the Data API's default row
  // cap. Read only comparison fields; archived records are included deliberately.
  while (true) {
    let query = supabase.from("cards").select("id,user_id,email,phone,secondary_phone,card_number,name,company,is_archived")
      .eq("user_id", userId).neq("id", excludedId).order("id", { ascending: true }).limit(CANDIDATES_PER_PAGE);
    if (cursor) query = query.gt("id", cursor);
    const result = await query;
    if (result.error) throw new Error("Duplicate lookup failed");
    for (const candidate of result.data) {
      if (candidate.user_id !== userId || candidate.id === excludedId) continue;
      const match = matchDuplicate(input, candidate);
      if (match) matches.push(match);
    }
    if (result.data.length < CANDIDATES_PER_PAGE) break;
    const next = result.data.at(-1)!.id;
    if (cursor && next <= cursor) throw new Error("Duplicate lookup did not advance");
    cursor = next;
  }
  return matches;
}
export function duplicateFingerprint(userId: string, submissionId: string, reviewedData: ReviewedCard, matches: DuplicateMatch[]) {
  // This is a stale-consent check, not an authentication credential. Ownership
  // is verified separately through the session and RLS on every request.
  return createHash("sha256").update(JSON.stringify({ userId, submissionId, reviewedData, matches: [...matches].sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
}
