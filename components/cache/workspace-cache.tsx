"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { MemoryCache, reuseImageUrl, signedImageKey } from "@/lib/cache/memory-cache";
import { createClient } from "@/lib/supabase/client";
import { CACHE_EVENT } from "@/lib/cache/events";
import { watchWorkspaceSession } from "@/lib/cache/session-watch";

const Context = createContext<{ cache: MemoryCache; owner: string } | null>(null);
const EMPTY = { status: "idle" as const };
export function WorkspaceCacheProvider({ owner, children }: { owner: string; children: React.ReactNode }) {
  const [cache] = useState(() => new MemoryCache());
  const router = useRouter();
  useEffect(() => {
    const client = createClient();
    const channel = typeof window.BroadcastChannel === "undefined" ? null : new window.BroadcastChannel("card-scanner-cache");
    const clear = (event: Event) => {
      cache.invalidate((event as CustomEvent<boolean>).detail);
      channel?.postMessage({ type: "invalidate" });
    };
    const stopSessionWatch = watchWorkspaceSession(client.auth, cache, owner, () => router.refresh());
    if (channel) channel.onmessage = () => { cache.invalidate(true); router.refresh(); };
    window.addEventListener(CACHE_EVENT, clear);
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { cache.invalidate(true); router.refresh(); } };
    window.addEventListener("pageshow", onPageShow);
    return () => { stopSessionWatch(); channel?.close(); window.removeEventListener(CACHE_EVENT, clear); window.removeEventListener("pageshow", onPageShow); cache.dispose(); };
  }, [cache, owner, router]);
  return <WorkspaceDataBoundary owner={owner} cache={cache}>{children}</WorkspaceDataBoundary>;
}

export function WorkspaceDataBoundary({ owner, cache, children }: { owner: string; cache: MemoryCache; children?: React.ReactNode }) {
  return <Context.Provider value={{ cache, owner }}>{children}</Context.Provider>;
}

const noSubscription = () => () => {};
// Also shares image links with the server-rendered edit screen on client navigation.
export function useReusableImageUrl(url: string | null) {
  const context = useContext(Context);
  const key = context ? signedImageKey(context.owner, url) : null;
  const cachedUrl = useSyncExternalStore(context?.cache.subscribe ?? noSubscription,
    () => context && key && context.cache.remaining(key) > 30_000 ? context.cache.get<string>(key) ?? url : url,
    () => url);
  useEffect(() => {
    if (!context || !url || !key) return;
    try {
      const token = new URL(url).searchParams.get("token")?.split(".")[1];
      if (!token) return;
      const payload: unknown = JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/")));
      // Token expiry bounds link reuse only; identity is always verified server-side.
      if (payload && typeof payload === "object" && "exp" in payload && typeof payload.exp === "number") reuseImageUrl(context.cache, context.owner, url, payload.exp * 1000);
    } catch { /* An opaque link can still display normally without being reused. */ }
  }, [context, url, key]);
  return cachedUrl;
}

export function useWorkspaceData<T>(key: string, milliseconds: number, imageData = false, enabled = true) {
  const router = useRouter();
  const context = useContext(Context);
  if (!context) throw new Error("Workspace cache provider is missing.");
  const { cache, owner } = context;
  const scopedKey = `${owner}:${key}`;
  const snapshot = useSyncExternalStore(cache.subscribe, () => cache.snapshot(scopedKey), () => EMPTY);
  useEffect(() => {
    if (!enabled || (snapshot.status !== "idle" && snapshot.status !== "stale")) return;
    const version = cache.version;
    void cache.load(scopedKey, milliseconds, async () => {
      const response = await fetch(`/api/workspace?${key}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (response.status === 401) { cache.block(); router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); router.refresh(); throw new Error("Session expired"); }
      if (!response.ok) throw new Error("Read failed");
      const result = await response.json() as { owner: string; data: T; imagesExpireAt: number };
      if (result.owner !== owner) { cache.block(); router.refresh(); throw new Error("Account changed"); }
      if (cache.version !== version) throw new Error("Read invalidated");
      if (imageData) {
        // Only API-generated URLs are traversed; source card strings stay untouched.
        const data = result.data as T & { imageUrl?: string | null; backImageUrl?: string | null; cards?: { imageUrl: string | null }[] };
        if ("imageUrl" in data) data.imageUrl = reuseImageUrl(cache, owner, data.imageUrl ?? null, result.imagesExpireAt, milliseconds);
        if ("backImageUrl" in data) data.backImageUrl = reuseImageUrl(cache, owner, data.backImageUrl ?? null, result.imagesExpireAt, milliseconds);
        data.cards?.forEach(card => { card.imageUrl = reuseImageUrl(cache, owner, card.imageUrl, result.imagesExpireAt, milliseconds); });
      }
      return result.data;
    });
  }, [cache, owner, scopedKey, key, milliseconds, snapshot.status, imageData, enabled, router]);
  return { data: snapshot.status !== "error" ? snapshot.value as T | undefined : undefined, error: snapshot.error, retry: () => cache.invalidate() };
}
