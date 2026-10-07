"use client";
import { Button } from "@/components/ui/button";
export default function CardError({ reset }: { reset: () => void }) {
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Unable to load this card</h1><p role="alert">Please try again. If your session expired, sign in again.</p><Button onClick={reset}>Try again</Button><a href="/login" className="ml-4 inline-block py-3 underline">Sign in</a></div>;
}
