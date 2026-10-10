import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRecoveryConfig, RECOVERY_COOKIE, validRecoveryGrant } from "@/lib/auth/recovery-grant";
import { AuthPanel } from "@/components/auth/auth-panel";
import { PasswordForm } from "@/components/auth/password-forms";
import { resetPassword } from "@/app/auth/password-actions";

export default async function NewPasswordPage() {
  let allowed = false;
  try {
    const { data, error } = await (await createClient()).auth.getUser();
    const grant = (await cookies()).get(RECOVERY_COOKIE)?.value;
    allowed = !error && !!data.user && validRecoveryGrant(grant, data.user.id, getRecoveryConfig().secret);
  } catch { /* Invalid configuration or expired sessions fail closed. */ }
  if (!allowed) redirect("/forgot-password?error=invalid_link");
  return <AuthPanel title="Choose a new password" description="Your reset link has been verified."><PasswordForm action={resetPassword} recovery /></AuthPanel>;
}
