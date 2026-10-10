import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { finishPasswordSignOut } from "@/app/auth/password-actions";

export default async function PasswordUpdatedPage({ searchParams }: { searchParams: Promise<{ signout?: string }> }) {
  const incomplete = (await searchParams).signout === "failed";
  return <AuthPanel title="Password updated" description="Use your new password the next time you sign in.">
    <div className="space-y-5">
      {incomplete && <div className="space-y-3"><p role="alert" className="text-sm">Your password was updated, but we could not confirm sign-out of all sessions. Sign out here and sign in again.</p><SignOutButton action={finishPasswordSignOut} /></div>}
      <Link href="/login" className="inline-flex min-h-11 items-center rounded text-primary underline focus-visible:outline-2 focus-visible:outline-ring">Sign in with your new password</Link>
    </div>
  </AuthPanel>;
}
