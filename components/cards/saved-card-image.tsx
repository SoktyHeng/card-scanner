"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SavedCardImage({ url, compact = false }: { url: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="space-y-3">
    {failed ? <div role="alert" className="rounded-xl border p-4 text-sm">
      This private image could not be loaded. Its temporary link may have expired.
      {compact ? <p className="mt-3">Open the card to reload its image.</p> : <Button type="button" variant="outline" className="mt-3 block" onClick={() => window.location.reload()}>Reload card image</Button>}
    </div> : <Image src={url} alt="Original scanned card" width={1200} height={800} unoptimized onError={() => setFailed(true)} className={`${compact ? "h-40" : "max-h-[32rem]"} w-full rounded-xl border object-contain`} />}
  </div>;
}
