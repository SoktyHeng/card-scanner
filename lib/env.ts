import { z } from "zod";

const publicKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine((key) => {
    if (key.startsWith("sb_publishable_")) return true;
    try {
      const payload: unknown = JSON.parse(atob(key.split(".")[1] ?? ""));
      return z.object({ role: z.literal("anon") }).safeParse(payload).success;
    } catch {
      return false;
    }
  }, "Use a publishable key or legacy anon key, never a secret/service-role key.");

export const publicEnvSchema = z.object({
  url: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  }, "Supabase requires HTTPS except for local development."),
  key: publicKeySchema,
});

export function getPublicEnv() {
  const result = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.success)
    throw new Error(
      "Supabase configuration is missing or invalid. Check .env.example and use only a public Supabase key.",
    );
  return result.data;
}
