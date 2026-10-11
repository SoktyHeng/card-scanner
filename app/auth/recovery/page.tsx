import { T } from "@/components/i18n/language-provider";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/auth-panel";
import { RecoveryConfirmationForm } from "@/components/auth/password-forms";
import { confirmRecovery } from "@/app/auth/password-actions";
import { recoveryTokenSchema } from "@/lib/auth/validation";
export default async function RecoveryPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const token = recoveryTokenSchema.safeParse(params.token_hash);
    const valid = token.success && params.type === "recovery";
    // Loading the email link does not consume it. Verification happens only on
    // the same-origin form POST, avoiding automatic mail-link scanner consumption.
    return <AuthPanel title="Verify password reset" description="Use your reset link to choose a new password.">
    {valid ? <RecoveryConfirmationForm action={confirmRecovery} tokenHash={token.data}/> : <div className="space-y-5">
      <p role="alert" className="text-sm text-destructive"><T text={"This password reset link is invalid or has expired."}/></p>
      <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded text-primary underline focus-visible:outline-2 focus-visible:outline-ring"><T text={"Request a new reset link"}/></Link>
    </div>}
  </AuthPanel>;
}
