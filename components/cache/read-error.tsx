"use client";
import { T } from "@/components/i18n/language-provider";

import { Button } from "@/components/ui/button";
export function CacheReadError({ retry }: {
    retry: () => void;
}) {
    return <div role="alert" className="space-y-3 rounded-xl border p-4">
    <p><T text={"Unable to load this data. It may no longer be available. Please try again."}/></p>
    <Button variant="outline" onClick={retry}><T text={"Retry loading"}/></Button>
  </div>;
}
