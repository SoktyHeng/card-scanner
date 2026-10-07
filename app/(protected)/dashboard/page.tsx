import { CreditCard, CalendarDays, Archive, Inbox } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export default async function DashboardPage() {
  const { user, supabase } = await requireUser();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [total, scannedToday, archived, recent] = await Promise.all([
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_archived", false),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", today.toISOString()),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_archived", true),
    supabase
      .from("cards")
      .select("id,name,company,card_type,created_at")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const failed = [total, scannedToday, archived, recent].some(
    (result) => result.error,
  );
  if (failed) console.error("dashboard database read failed");
  const stats = [
    { label: "Active cards", value: total.count, icon: CreditCard },
    {
      label: "Scanned today (UTC)",
      value: scannedToday.count,
      icon: CalendarDays,
    },
    { label: "Archived cards", value: archived.count, icon: Archive },
  ];
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-sm font-medium text-primary">YOUR WORKSPACE</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        <p className="mt-3 text-muted-foreground">
          A simple home for your card collection.
        </p>
      </div>
      {failed && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-4 text-sm"
        >
          Unable to load your cards. Please try again. If this is a new
          installation, complete the database setup first.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardDescription>{label}</CardDescription>
              <Icon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {failed ? "—" : (value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent cards</CardTitle>
          <CardDescription>
            Your five most recently saved cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failed ? (
            <p className="py-8 text-center text-muted-foreground">
              Card data is currently unavailable.
            </p>
          ) : recent.data?.length ? (
            <ul className="divide-y">
              {recent.data.map((card) => (
                <li
                  key={card.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-medium">
                      <Link href={`/cards/${card.id}`} className="rounded underline-offset-4 hover:underline focus-visible:outline-2">{card.name || card.company || "Untitled card"}</Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {card.company || card.card_type || "Card"}
                    </p>
                  </div>
                  <time
                    dateTime={card.created_at}
                    className="text-sm text-muted-foreground"
                  >
                    {new Date(card.created_at).toLocaleDateString("en", {
                      timeZone: "UTC",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <Inbox
                className="mb-4 size-9 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-medium">Your collection starts here</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                No cards yet. You can now capture or select a card image and
                check its preview.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Button asChild>
        <Link href="/scan">Scan a card</Link>
      </Button>
    </div>
  );
}
