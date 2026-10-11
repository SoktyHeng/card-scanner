export const CACHE_EVENT = "workspace-cache-invalidated";
export function invalidateWorkspaceCache(clearImages = false) {
  if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent(CACHE_EVENT, { detail: clearImages }));
}
