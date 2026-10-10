import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const RECOVERY_COOKIE = "card-scanner-recovery";
export const RECOVERY_SECONDS = 15 * 60;
const grantSchema = z.strictObject({ userId: z.uuid(), expires: z.number().int() });
const configSchema = z.strictObject({
  siteUrl: z.url().refine(value => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  }),
  secret: z.string().min(32).max(512),
});
export function getRecoveryConfig() {
  const result = configSchema.safeParse({ siteUrl: process.env.APP_SITE_URL, secret: process.env.AUTH_RECOVERY_SECRET });
  if (!result.success) throw new Error("Password recovery configuration unavailable");
  return { ...result.data, siteUrl: new URL(result.data.siteUrl).origin };
}
export function issueRecoveryGrant(userId: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify(grantSchema.parse({ userId, expires: Math.floor(now / 1000) + RECOVERY_SECONDS }))).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function validRecoveryGrant(token: string | undefined, userId: string, secret: string, now = Date.now()) {
  if (!token || token.length > 1000) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const grant = grantSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const seconds = Math.floor(now / 1000);
    return grant.userId === userId && grant.expires > seconds && grant.expires <= seconds + RECOVERY_SECONDS;
  } catch { return false; }
}
