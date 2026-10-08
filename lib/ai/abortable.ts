import "server-only";
import { ExtractionError } from "./errors";

// Keep the endpoint's deadline even if a future provider forgets to observe
// its signal. Existing providers also pass this signal to fetch to stop I/O.
export async function awaitExtraction<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new ExtractionError("EXTRACTION_TIMEOUT");
  let abort!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new ExtractionError("EXTRACTION_TIMEOUT"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(work), stopped]); }
  finally { signal.removeEventListener("abort", abort); }
}
