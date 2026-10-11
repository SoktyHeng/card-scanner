"use client";
import { T } from "@/components/i18n/language-provider";

import { Button } from "@/components/ui/button";
export default function CardError({ reset }: {
    reset: () => void;
}) {
    return <div className="space-y-4"><h1 className="text-2xl font-semibold"><T text={"Unable to load this card"}/></h1><p role="alert"><T text={"Please try again. If your session expired, sign in again."}/></p><Button onClick={reset}><T text={"Try again"}/></Button><a href="/login" className="ml-4 inline-block py-3 underline"><T text={"Sign in"}/></a></div>;
}
