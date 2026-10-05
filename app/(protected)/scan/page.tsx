import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { CardScanner } from "@/components/scanner/card-scanner";

export const metadata: Metadata = { title: "Scan a card | Card Scanner" };

export default async function ScanPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <p className="mb-2 text-sm font-medium text-primary">
          ADD TO YOUR COLLECTION
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Scan a card
        </h1>
        <p className="mt-3 text-muted-foreground">
          Take a photo or choose an image, then check the preview before
          continuing.
        </p>
      </div>
      <CardScanner />
    </div>
  );
}
