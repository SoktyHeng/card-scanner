import "server-only";
import { newPasswordSchema, recoveryTokenSchema, resetEmailSchema, signInSchema } from "./validation";
import { issueRecoveryGrant, validRecoveryGrant } from "./recovery-grant";

export type PasswordState = { error?: string; message?: string; success?: boolean; signedOut?: boolean };
type Result = { error: unknown };
export interface PasswordAuth {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<Result>;
  verifyOtp(options: { token_hash: string; type: "recovery" }): Promise<Result>;
  getUser(): Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  signInWithPassword(options: { email: string; password: string }): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  updateUser(options: { password: string; current_password?: string }): Promise<Result>;
  signOut(options: { scope: "global" }): Promise<Result>;
}
export const RESET_MESSAGE = "If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.";
export const INVALID_RECOVERY = "This password reset link is invalid or has expired. Request a new link.";

export async function requestPasswordReset(auth: PasswordAuth, input: unknown, siteUrl: string): Promise<PasswordState> {
  const parsed = resetEmailSchema.safeParse({ email: input });
  if (!parsed.success) return { error: "Enter a valid email address." };
  // Identical responses for missing accounts, delivery errors and rate limits.
  try { await auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/recovery` }); }
  catch { /* Do not expose account existence or SMTP/provider diagnostics. */ }
  return { success: true, message: RESET_MESSAGE };
}

export async function verifyPasswordRecovery(auth: PasswordAuth, token: unknown, secret: string): Promise<string | null> {
  const parsed = recoveryTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  try {
    if ((await auth.verifyOtp({ token_hash: parsed.data, type: "recovery" })).error) return null;
    const { data, error } = await auth.getUser();
    if (error || !data.user) return null;
    return issueRecoveryGrant(data.user.id, secret);
  } catch { return null; }
}

export async function savePassword(auth: PasswordAuth, form: FormData, options: { recovery?: { grant: string | undefined; secret: string }; clearGrant: () => Promise<void> }): Promise<PasswordState> {
  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirmation: form.get("confirmation") });
  if (!parsed.success) return { error: "Use a password of 12–128 characters and enter the same password twice." };
  const current = signInSchema.shape.password.safeParse(form.get("currentPassword"));
  if (!options.recovery && (!current.success || current.data === parsed.data.password))
    return { error: "Enter your current password and choose a different new password." };
  try {
    const { data, error } = await auth.getUser();
    if (error || !data.user) return { error: "Your session has expired. Sign in again or request a new reset link." };
    if (options.recovery && !validRecoveryGrant(options.recovery.grant, data.user.id, options.recovery.secret)) return { error: INVALID_RECOVERY };
    // Hosted Auth versions/policies may ignore current_password. Independently
    // verify it against the server-verified account, never an entered email.
    if (!options.recovery && current.success) {
      if (!data.user.email) return { error: "Unable to verify your current password. Sign in again." };
      const verified = await auth.signInWithPassword({ email: data.user.email, password: current.data });
      if (verified.error || verified.data.user?.id !== data.user.id)
        return { error: "Unable to verify your current password. Check it and try again." };
    }
    const update = await auth.updateUser({ password: parsed.data.password, ...(!options.recovery && current.success ? { current_password: current.data } : {}) });
    if (update.error) return { error: "Unable to update your password. Check your current password or the password requirements and try again." };
  } catch { return { error: "Unable to update your password. Please try again." }; }
  // The mutation is confirmed. Never describe a later sign-out failure as a
  // failed password change or invite the user to repeat the mutation.
  let signedOut = false;
  try { await options.clearGrant(); } catch { /* Confirmed update still succeeded. */ }
  try { signedOut = !(await auth.signOut({ scope: "global" })).error; } catch { /* Confirmed update still succeeded. */ }
  return { success: true, signedOut, message: signedOut ? "Password updated. Sign in again with your new password." : "Password updated, but we could not sign out all sessions. Sign out and sign in again with your new password." };
}
