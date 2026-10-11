import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import { getVerifiedPageUser } from "@/lib/auth/page-user";
import { createWorkspaceReadHandler } from "@/lib/cards/workspace-read-handler";
export const runtime = "nodejs";
export const GET = createWorkspaceReadHandler(async () => {
  const supabase = await createClient();
  const user = await getVerifiedPageUser(supabase.auth, getPublicEnv().url);
  return user ? { supabase, userId: user.id } : null;
});
