import { createClient } from "@/lib/supabase/server";
import { createManagementHandler } from "@/lib/cards/management-handler";

export const runtime = "nodejs";
async function authenticate() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && (error.status === 0 || (error.status !== undefined && error.status >= 500))) throw new Error("Auth unavailable");
  return error || !data.user ? null : { supabase, userId: data.user.id };
}
export const PATCH = createManagementHandler(authenticate);
export const DELETE = createManagementHandler(authenticate, true);
