import Link from "next/link";
import { ScanLine } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { MainNavigation } from "@/components/layout/main-navigation";
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link
            href="/dashboard"
            className="flex min-h-11 items-center gap-3 rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ScanLine className="size-5" aria-hidden="true" />
            </span>
            Card Scanner
          </Link>
          <div className="flex min-w-0 items-center gap-3 md:order-2">
            <p className="hidden max-w-64 truncate text-sm text-muted-foreground sm:block">
              {user.email}
            </p>
            <SignOutButton />
          </div>
          <div className="w-full md:order-1 md:w-auto"><MainNavigation /></div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
