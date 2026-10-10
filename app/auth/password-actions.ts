"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRecoveryConfig, RECOVERY_COOKIE, RECOVERY_SECONDS } from "@/lib/auth/recovery-grant";
import { INVALID_RECOVERY, requestPasswordReset, savePassword, verifyPasswordRecovery, type PasswordState } from "@/lib/auth/password-service";
import { isSameOriginRequest } from "@/lib/auth/request-origin";

async function allowedRequest() {
  const incoming = await headers();
  const protocol = incoming.get("x-forwarded-proto") ?? "http";
  const host = incoming.get("host");
  if (!host || !["http", "https"].includes(protocol)) return false;
  return isSameOriginRequest(new Request(`${protocol}://${host}`, { headers: incoming }));
}

export async function forgotPassword(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  try {
    if (!await allowedRequest()) return { error: "This password request is not allowed." };
    const config = getRecoveryConfig();
    return await requestPasswordReset((await createClient()).auth, form.get("email"), config.siteUrl);
  } catch { return { error: "Password recovery is temporarily unavailable. Please try again later." }; }
}

export async function confirmRecovery(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  let verified = false;
  try {
    if (!await allowedRequest()) return { error: "This password request is not allowed." };
    const config = getRecoveryConfig();
    const store = await cookies();
    store.delete(RECOVERY_COOKIE);
    const grant = await verifyPasswordRecovery((await createClient()).auth, form.get("tokenHash"), config.secret);
    if (grant) {
      store.set(RECOVERY_COOKIE, grant, { httpOnly: true, sameSite: "lax", secure: config.siteUrl.startsWith("https:"), path: "/", maxAge: RECOVERY_SECONDS });
      verified = true;
    }
  } catch { return { error: INVALID_RECOVERY }; }
  if (!verified) return { error: INVALID_RECOVERY };
  redirect("/auth/new-password");
}

export async function changePassword(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  return updatePassword(form, false);
}
export async function resetPassword(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  return updatePassword(form, true);
}
async function updatePassword(form: FormData, recovery: boolean): Promise<PasswordState> {
  let state: PasswordState;
  try {
    if (!await allowedRequest()) return { error: "This password request is not allowed." };
    const store = await cookies();
    state = await savePassword((await createClient()).auth, form, {
      ...(recovery ? { recovery: { grant: store.get(RECOVERY_COOKIE)?.value, secret: getRecoveryConfig().secret } } : {}),
      clearGrant: async () => { store.delete(RECOVERY_COOKIE); },
    });
  } catch { return { error: "Password update is temporarily unavailable. Please try again." }; }
  if (state.success) {
    revalidatePath("/", "layout");
    // Cookie writes rerender protected pages. Leave the reset screen explicitly
    // so successful sign-out is not mistaken for an expired recovery link.
    redirect(state.signedOut ? "/auth/password-updated" : "/auth/password-updated?signout=failed");
  }
  return state;
}

export async function finishPasswordSignOut(): Promise<PasswordState> {
  try {
    if (!await allowedRequest()) return { error: "This password request is not allowed." };
    (await cookies()).delete(RECOVERY_COOKIE);
    const { error } = await (await createClient()).auth.signOut({ scope: "global" });
    if (error) return { error: "Unable to sign out all sessions. Please try again." };
  } catch { return { error: "Unable to sign out all sessions. Please try again." }; }
  revalidatePath("/", "layout");
  redirect("/login");
}
