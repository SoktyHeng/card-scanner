// Reverse proxies must overwrite Host and X-Forwarded-Proto with the public
// application host/protocol, rather than forwarding caller-supplied values.
// Never let a caller override it using an untrusted X-Forwarded-Host header.
export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still require a verified session.
  try {
    const parsed = new URL(origin);
    const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password
      && parsed.origin === origin
      && parsed.protocol === `${protocol}:`
      && parsed.host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch { return false; }
}
