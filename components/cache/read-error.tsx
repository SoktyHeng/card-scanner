"use client";
import { Button } from "@/components/ui/button";
export function CacheReadError({ retry }: { retry: () => void }) {
  return <div role="alert" className="space-y-3 rounded-xl border p-4">
    <p>Unable to load this data. It may no longer be available. Please try again.</p>
    <Button variant="outline" onClick={retry}>Retry loading</Button>
  </div>;
}
