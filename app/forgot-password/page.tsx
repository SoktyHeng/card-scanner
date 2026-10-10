import { AuthPanel } from "@/components/auth/auth-panel";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { forgotPassword } from "@/app/auth/password-actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const invalid = (await searchParams).error === "invalid_link";
  return <AuthPanel title="Reset your password" description="Enter your account email to request a reset link.">
    {invalid && <p role="alert" className="mb-5 text-sm text-destructive">This password reset link is invalid or has expired. Request a new link.</p>}
    <ForgotPasswordForm action={forgotPassword} />
  </AuthPanel>;
}
