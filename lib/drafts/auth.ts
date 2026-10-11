import "server-only";
import { createClient } from "@/lib/supabase/server";
export async function authenticateDrafts() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error && (error.status === 0 || (error.status !== undefined && error.status >= 500))) throw new Error("Auth unavailable");
  return error || !data.user ? null : { userId: data.user.id, supabase };
}
