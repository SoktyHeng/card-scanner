import assert from "node:assert/strict";
import { test } from "node:test";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { watchWorkspaceSession } from "../lib/cache/session-watch";
import { MemoryCache } from "../lib/cache/memory-cache";

test("sign-out, missing sessions and account switches clear and block cached reads; same-account refresh preserves valid data", () => {
  const cache = new MemoryCache();
  let notify: (event: AuthChangeEvent, session: Session | null) => void | Promise<void> = () => {};
  let refreshes = 0, stopped = false;
  const stop = watchWorkspaceSession({ onAuthStateChange: callback => {
    notify = callback;
    return { data: { subscription: { id: "test", callback, unsubscribe: () => { stopped = true; } } } };
  } }, cache, "A", () => { refreshes++; });
  const session: Session = { access_token: "test", refresh_token: "test", token_type: "bearer", expires_in: 300, expires_at: Math.floor(Date.now() / 1000) + 300,
    user: { id: "A", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-11T00:00:00Z" } };
  cache.set("A:dashboard", "A", 45_000);
  void notify("TOKEN_REFRESHED", session);
  assert.equal(cache.get("A:dashboard"), "A"); assert.equal(refreshes, 0);
  void notify("SIGNED_IN", { ...session, user: { ...session.user, id: "B" } });
  assert.equal(cache.get("A:dashboard"), undefined); assert.equal(refreshes, 1);
  void notify("SIGNED_IN", session);
  cache.set("image:A:path", "signed", 270_000);
  void notify("SIGNED_OUT", null);
  assert.equal(cache.get("image:A:path"), undefined); assert.equal(cache.snapshot("A:dashboard").status, "error");
  void notify("INITIAL_SESSION", null);
  assert.equal(refreshes, 3);
  stop(); assert.equal(stopped, true); cache.dispose();
});
