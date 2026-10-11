"use client";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useReusableImageUrl } from "@/components/cache/workspace-cache";

export function FlippableCardImage({ frontUrl, backUrl }: { frontUrl: string | null; backUrl: string | null }) {
  const frontImageUrl = useReusableImageUrl(frontUrl);
  const backImageUrl = useReusableImageUrl(backUrl);
  const [side, setSide] = useState<"front" | "back">(frontUrl ? "front" : "back");
  const [failed, setFailed] = useState({ front: false, back: false });
  const canFlip = !!frontUrl && !!backUrl;
  const toggle = () => setSide(current => current === "front" ? "back" : "front");
  if (!frontUrl && !backUrl) return null;
  const faces = <div className={`card-flip-inner ${side === "back" && canFlip ? "card-flip-back" : ""}`}>
    {(["front", "back"] as const).map(face => {
      const url = face === "front" ? frontImageUrl : backImageUrl;
      if (!url) return null;
      return <div key={face} aria-hidden={side !== face} className={`card-flip-face ${canFlip && face === "back" ? "card-flip-reverse" : ""}`}>
        {failed[face] ? <span className="flex h-full items-center justify-center p-4 text-sm">The {face} image could not be loaded.</span>
          : <Image src={url} alt={`Original card ${face}`} width={1200} height={800} unoptimized onError={() => setFailed(current => ({ ...current, [face]: true }))} className="h-full w-full rounded-xl object-contain" />}
      </div>;
    })}
  </div>;
  return <section aria-label="Original card images" className="space-y-3">
    <p role="status" aria-live="polite" className="text-sm font-semibold">{side === "front" ? "Front" : "Back"}</p>
    {canFlip ? <button type="button" onClick={toggle} aria-label={side === "front" ? "Show back of card" : "Show front of card"} className="card-flip relative block aspect-[3/2] max-h-[32rem] w-full cursor-pointer rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{faces}</button>
      : <div className="card-flip relative aspect-[3/2] max-h-[32rem] w-full rounded-xl border bg-card">{faces}</div>}
    {canFlip && <Button type="button" variant="outline" onClick={toggle}>{side === "front" ? "Show back" : "Show front"}</Button>}
    {failed[side] && <div role="alert" className="rounded-lg border p-3 text-sm">This temporary image link may have expired. <Button type="button" variant="outline" className="mt-3" onClick={() => window.location.reload()}>Reload card images</Button></div>}
  </section>;
}
