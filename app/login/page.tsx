import { redirect } from "next/navigation";
import { ScanLine, ShieldCheck } from "lucide-react";
import { getPageSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/validation";
import { SignInForm } from "@/components/auth/sign-in-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getPageSession()) redirect(next);
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ScanLine aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold tracking-wide text-muted-foreground">
            CARD SCANNER
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your cards, in one place.
          </h1>
          <p className="text-muted-foreground">
            Sign in to your private card workspace.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Use the email and password for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm next={next} />
          </CardContent>
        </Card>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Your workspace is visible only to you.
        </p>
      </div>
    </main>
  );
}
