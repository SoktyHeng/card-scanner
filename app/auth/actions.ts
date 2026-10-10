"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE } from "@/lib/auth/recovery-grant";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath, signInSchema } from "@/lib/auth/validation";
export type AuthState = { error?: string };
export async function signIn(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success)
    return { error: "Enter a valid email address and password." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error)
      return {
        error:
          "Unable to sign in. Check your email and password and try again.",
      };
    (await cookies()).delete(RECOVERY_COOKIE);
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next")));
}
export async function signOut(): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    (await cookies()).delete(RECOVERY_COOKIE);
    if (error) return { error: "Unable to sign out. Please try again." };
  } catch {
    return { error: "Sign-out is temporarily unavailable. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
