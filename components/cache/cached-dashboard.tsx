"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import { CreditCard, CalendarDays, Archive, Inbox } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useWorkspaceData } from "@/components/cache/workspace-cache";
import type { getDashboard } from "@/lib/cards/dashboard";
import Loading from "@/app/(protected)/loading";
import { CacheReadError } from "@/components/cache/read-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
export function CachedDashboard() {
    const { date, number } = useLanguage();
    const { data, error, retry } = useWorkspaceData<Awaited<ReturnType<typeof getDashboard>>>("type=dashboard", 45000);
    if (error)
        return <CacheReadError retry={retry}/>;
    if (!data)
        return <Loading />;
    const stats = [
        { label: "Active cards", value: data.total, icon: CreditCard },
        {
            label: "Scanned today (Cambodia)",
            value: data.scannedToday,
            icon: CalendarDays,
        },
        { label: "Archived cards", value: data.archived, icon: Archive },
    ];
    return (<div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>
        <p className="mb-2 text-sm font-medium text-primary"><T text={"YOUR WORKSPACE"}/></p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl"><T text={"Dashboard"}/></h1>
        <p className="mt-3 text-muted-foreground"><T text={"A simple home for your card collection."}/></p>
      </div><Button asChild className="w-full sm:w-auto"><Link href="/scan"><T text={"Scan a card"}/></Link></Button></div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (<Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardDescription>{<T text={label}/>}</CardDescription>
              <Icon className="size-5 text-muted-foreground" aria-hidden="true"/>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {number(value ?? 0)}
              </p>
            </CardContent>
          </Card>))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle><T text={"Recent cards"}/></CardTitle>
          <CardDescription><T text={"Your five most recently saved cards."}/> <T text="Dates and times use Cambodia time (UTC+7)."/></CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent.length ? (<ul className="divide-y">
              {data.recent.map((card) => (<li key={card.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">
                      <Link href={`/cards/${card.id}`} className="rounded underline-offset-4 hover:underline focus-visible:outline-2">{card.name || card.company || <T text={"Untitled card"}/>}</Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {card.company || card.card_type || <T text={"Card"}/>}
                    </p>
                  </div>
                  <time dateTime={card.created_at} className="text-sm text-muted-foreground">
                    {date(card.created_at)}
                  </time>
                </li>))}
            </ul>) : (<div className="flex flex-col items-center py-10 text-center">
              <Inbox className="mb-4 size-9 text-muted-foreground" aria-hidden="true"/>
              <h2 className="font-medium"><T text={"Your collection starts here"}/></h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground"><T text={"No cards yet. You can now capture or select a card image and check its preview."}/></p>
            </div>)}
        </CardContent>
      </Card>
    </div>);
}
