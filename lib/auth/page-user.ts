import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const pageClaimsSchema = z.object({
  sub: z.uuid(),
  iss: z.string(),
  aud: z.union([z.literal("authenticated"), z.array(z.string()).refine(values => values.includes("authenticated"))]),
  role: z.literal("authenticated"),
  exp: z.number().int(),
  email: z.string().optional(),
});

// getClaims verifies the signature; reading a decoded session alone is unsafe.
// Mutations continue to use getUser for an authoritative account lookup.
export async function getVerifiedPageUser(auth: Pick<SupabaseClient["auth"], "getClaims">, projectUrl: string) {
  const { data, error } = await auth.getClaims();
  if (error) return null;
  const result = pageClaimsSchema.safeParse(data?.claims);
  if (!result.success) return null;
  const claims = result.data;
  if (claims.iss !== `${projectUrl.replace(/\/$/, "")}/auth/v1` || claims.exp <= Date.now() / 1000) return null;
  return { id: claims.sub, email: claims.email };
}
