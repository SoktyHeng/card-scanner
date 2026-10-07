import Link from "next/link";
import { ScanLine } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/auth/sign-out-button";
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 font-semibold"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ScanLine className="size-5" aria-hidden="true" />
            </span>
            Card Scanner
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <nav
              aria-label="Main navigation"
              className="flex gap-3 text-sm font-medium"
            >
              <Link
                href="/dashboard"
                className="rounded-md px-1 py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Dashboard
              </Link>
              <Link
                href="/cards"
                className="rounded-md px-1 py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Cards
              </Link>
              <Link
                href="/scan"
                className="rounded-md px-1 py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Scan card
              </Link>
            </nav>
            <p className="hidden max-w-64 truncate text-sm text-muted-foreground sm:block">
              {user.email}
            </p>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12"
      >
        {children}
      </main>
    </div>
  );
}
