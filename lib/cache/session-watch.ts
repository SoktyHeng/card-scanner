import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryCache } from "./memory-cache";

export function watchWorkspaceSession(auth: Pick<SupabaseClient["auth"], "onAuthStateChange">, cache: MemoryCache, owner: string, refresh: () => void) {
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    clearTimeout(expiryTimer);
    if (event === "SIGNED_OUT" || !session || session.user.id !== owner) {
      cache.block();
      refresh();
    } else if (session.expires_at) {
      cache.unblock();
      expiryTimer = setTimeout(() => { cache.invalidate(true); refresh(); }, Math.max(0, session.expires_at * 1000 - Date.now()));
    }
  });
  return () => { clearTimeout(expiryTimer); subscription.unsubscribe(); };
}
