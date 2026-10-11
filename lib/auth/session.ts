import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { getVerifiedPageUser } from "./page-user";

// React cache is scoped to one server render, never shared between users.
export const getPageSession = cache(async () => {
  const supabase = await createClient();
  const user = await getVerifiedPageUser(supabase.auth, getPublicEnv().url);
  return user ? { user, supabase } : null;
});

export async function requireUser() {
  const session = await getPageSession();
  if (!session) redirect("/login");
  return session;
}
