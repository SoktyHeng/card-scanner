export type CacheSnapshot = { status: "idle" | "loading" | "ready" | "stale" | "error"; value?: unknown; error?: string };
const IDLE: CacheSnapshot = { status: "idle" };
const BLOCKED: CacheSnapshot = { status: "error", error: "Your session changed. Please sign in again." };
type Entry = { snapshot: CacheSnapshot; stale: CacheSnapshot; until: number; timer?: ReturnType<typeof setTimeout> };

// Constructed per mounted browser provider. No storage, cookies or server globals.
export class MemoryCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private generation = 0;
  private blocked = false;
  get version() { return this.generation; }
  constructor(private now = Date.now, private limit = 80) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = (key: string): CacheSnapshot => {
    if (this.blocked) return BLOCKED;
    const entry = this.entries.get(key);
    if (!entry) return IDLE;
    if (entry.until > this.now()) return entry.snapshot;
    // Retain data only during a bounded refresh window, never after invalidation.
    return entry.snapshot.status === "ready" && entry.until + 30_000 > this.now() ? entry.stale : IDLE;
  };
  get<T>(key: string): T | undefined {
    const snapshot = this.snapshot(key);
    return snapshot.status === "ready" ? snapshot.value as T : undefined;
  }
  remaining(key: string) { return Math.max(0, (this.entries.get(key)?.until ?? 0) - this.now()); }
  set(key: string, value: unknown, milliseconds: number) {
    this.put(key, { status: "ready", value }, milliseconds);
  }
  private emit() { this.listeners.forEach(listener => listener()); }
  private remove(key: string) {
    clearTimeout(this.entries.get(key)?.timer);
    this.entries.delete(key);
  }
  private put(key: string, snapshot: CacheSnapshot, milliseconds: number) {
    this.remove(key);
    while (this.entries.size >= this.limit) this.remove(this.entries.keys().next().value!);
    const entry: Entry = { snapshot, stale: { status: "stale", value: snapshot.value }, until: this.now() + milliseconds };
    entry.timer = setTimeout(() => {
      if (this.entries.get(key) !== entry) return;
      if (snapshot.status === "ready" && !key.startsWith("image:")) {
        entry.timer = setTimeout(() => { if (this.entries.get(key) === entry) { this.remove(key); this.emit(); } }, 30_000);
        entry.timer.unref?.();
      } else this.remove(key);
      this.emit();
    }, milliseconds);
    entry.timer.unref?.();
    this.entries.set(key, entry);
    this.emit();
  }
  load<T>(key: string, milliseconds: number, loader: () => Promise<T>): Promise<void> {
    if (this.blocked) return Promise.resolve();
    if (this.get<T>(key) !== undefined) return Promise.resolve();
    const existing = this.pending.get(key);
    if (existing) return existing;
    const generation = this.generation;
    this.put(key, { status: "loading", value: this.snapshot(key).value }, 60_000);
    const task = Promise.resolve().then(loader).then(value => {
      if (this.generation === generation && this.pending.get(key) === task) this.set(key, value, milliseconds);
    }, () => {
      if (this.generation === generation && this.pending.get(key) === task) this.put(key, { status: "error", error: "Unable to load this data. Please try again." }, 30_000);
    }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
    this.pending.set(key, task);
    return task;
  }
  invalidate(includeImages = false) {
    this.generation++;
    this.pending.clear();
    for (const key of this.entries.keys()) if (includeImages || !key.startsWith("image:")) this.remove(key);
    this.emit();
  }
  block() { this.blocked = true; this.invalidate(true); }
  unblock() { if (this.blocked) { this.blocked = false; this.emit(); } }
  dispose() { this.invalidate(true); this.listeners.clear(); }
}

export function signedImageKey(owner: string, url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.split("/object/sign/card-images/")[1] ?? "");
    return path.startsWith(`${owner}/`) && !path.includes("..") ? `image:${owner}:${path}` : null;
  } catch { return null; }
}

export function reuseImageUrl(cache: MemoryCache, owner: string, url: string | null, expiresAt: number, minimumLifetime = 30_000) {
  const key = signedImageKey(owner, url);
  if (!key || !url || expiresAt <= Date.now() + 30_000) return url;
  const existing = cache.get<string>(key);
  if (existing && cache.remaining(key) > minimumLifetime) return existing;
  cache.set(key, url, expiresAt - Date.now() - 30_000);
  return url;
}
