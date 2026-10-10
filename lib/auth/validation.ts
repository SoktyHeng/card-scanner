import { z } from "zod";
export const signInSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(1024),
});
export const resetEmailSchema = signInSchema.pick({ email: true });
export const newPasswordSchema = z.object({
  password: z.string().min(12).max(128).refine(value => !!value.trim()),
  confirmation: z.string().min(1).max(128),
}).refine(value => value.password === value.confirmation, {
  path: ["confirmation"], message: "Passwords must match.",
});
export const recoveryTokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{20,256}$/);
export function safeRedirectPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s\u0000-\u001f]/.test(value)
  )
    return "/dashboard";
  try {
    const parsed = new URL(value, "https://app.invalid");
    const path = decodeURIComponent(parsed.pathname);
    if (
      path.includes("\\") ||
      path.includes("..") ||
      parsed.origin !== "https://app.invalid"
    )
      return "/dashboard";
    return ["/dashboard", "/cards", "/scan", "/account"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
      ? parsed.pathname + parsed.search
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
