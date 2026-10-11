"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import { Skeleton } from "@/components/ui/skeleton";
import { reviewFieldOrder } from "@/lib/cards/review";
function FieldSkeleton() {
    return <div className="min-w-0 rounded-lg border p-3">
    <Skeleton className="h-5 w-24 max-w-full"/>
    <Skeleton className="mt-1 h-6 w-3/4"/>
  </div>;
}
export function CardListItemSkeleton() {
    return <div className="min-w-0 space-y-3 rounded-xl border bg-card p-4" aria-hidden="true">
    <Skeleton className="h-40 w-full rounded-xl"/>
    <Skeleton className="h-7 w-2/3"/>
    <div className="space-y-2">
      {["company", "job", "phone", "email"].map(field => <div key={field}>
        <Skeleton className="mb-1 h-4 w-20"/>
        <Skeleton className="h-5 w-4/5"/>
      </div>)}
    </div>
    <Skeleton className="h-4 w-36 max-w-full"/>
  </div>;
}
export function CardListSkeleton() {
    const { t } = useLanguage();
    return <>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only"><T text={"Loading your cards\u2026"}/></p>
    <section className="space-y-6" aria-busy="true" aria-label={t("Card list loading")}>
    <div aria-hidden="true" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-9 w-40 max-w-full"/><Skeleton className="h-4 w-64 max-w-full"/></div>
        <Skeleton className="h-11 w-32"/>
      </div>
      <div className="flex h-12 items-center gap-4">
        <Skeleton className="h-6 w-24"/><Skeleton className="h-6 w-28"/>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
        <Skeleton className="h-4 w-24"/>
        <div className="flex flex-col gap-3 sm:flex-row"><Skeleton className="h-11 min-w-0 flex-1"/><div className="grid grid-cols-2 gap-3 sm:flex"><Skeleton className="h-11 sm:w-24"/><Skeleton className="h-11 sm:w-28"/></div></div>
        <Skeleton className="h-4 w-3/4"/>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => <CardListItemSkeleton key={index}/>)}
      </div>
      <div className="flex h-12 items-center"><Skeleton className="h-5 w-20"/></div>
    </div>
    </section>
  </>;
}
export function CardDetailSkeleton() {
    const { t } = useLanguage();
    return <>
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only"><T text={"Loading your card\u2026"}/></p>
    <section className="mx-auto max-w-3xl space-y-6" aria-busy="true" aria-label={t("Card details loading")}>
    <div aria-hidden="true" className="space-y-6">
      <div className="flex h-12 items-center"><Skeleton className="h-6 w-28"/></div>
      <Skeleton className="h-9 w-2/3"/>
      <Skeleton className="h-5 w-72 max-w-full"/>
      <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
        <Skeleton className="h-11 sm:w-24"/>
        <Skeleton className="h-11 sm:w-32"/>
        <Skeleton className="h-11 sm:w-40"/>
      </div>
      <Skeleton className="h-5 w-3/4"/>
      <Skeleton className="aspect-[3/2] max-h-[32rem] w-full rounded-xl"/>
      <div className="grid gap-4 sm:grid-cols-2">
        {reviewFieldOrder.map(field => <FieldSkeleton key={field}/>)}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-40"/>
        <div className="grid gap-3 sm:grid-cols-2"><FieldSkeleton /><FieldSkeleton /></div>
      </div>
      <Skeleton className="h-5 w-60 max-w-full"/>
      <Skeleton className="h-5 w-64 max-w-full"/>
      <Skeleton className="h-12 w-full"/>
      <Skeleton className="h-11 w-40"/>
    </div>
    </section>
  </>;
}
