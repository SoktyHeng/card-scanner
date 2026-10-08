import "server-only";
import { ExtractionError } from "./errors";

// Local protection for expensive inference. This is deliberately not presented
// as a distributed quota: replicas/restarts have independent counters.
export function createExtractionLimit(now = Date.now, maxAccounts = 10000) {
  const accounts = new Map<string, { started: number; requests: number; active: boolean }>();
  return (userId: string): (() => void) => {
    const time = now();
    for (const [id, entry] of accounts) {
      if (!entry.active && time - entry.started >= 60000) accounts.delete(id);
    }
    let entry = accounts.get(userId);
    if (entry?.active || (entry && entry.requests >= 6)) throw new ExtractionError("REQUEST_RATE_LIMITED");
    if (!entry) {
      if (accounts.size >= maxAccounts) throw new ExtractionError("REQUEST_RATE_LIMITED");
      entry = { started: time, requests: 0, active: false };
      accounts.set(userId, entry);
    }
    entry.requests++;
    entry.active = true;
    return () => { entry.active = false; };
  };
}
export const acquireExtraction = createExtractionLimit();
