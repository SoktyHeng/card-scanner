"use client";
import { T } from "@/components/i18n/language-provider";

import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: {
    reset: () => void;
}) {
    return (<main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <h1 className="text-2xl font-semibold"><T text={"Unable to load your workspace"}/></h1>
      <p className="text-muted-foreground"><T text={"Please try again. If the problem continues, contact your administrator."}/></p>
      <Button onClick={reset}><T text={"Try again"}/></Button>
    </main>);
}
