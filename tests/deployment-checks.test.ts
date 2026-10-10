import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyDeployment } from "../scripts/deployment-checks";

const headers = {
  "x-content-type-options": "nosniff", "x-frame-options": "DENY",
  "referrer-policy": "no-referrer", "content-security-policy": "frame-ancestors 'none'",
  "permissions-policy": "camera=(self)", "strict-transport-security": "max-age=31536000",
};
const fetcher: typeof fetch = async (input, init) => {
  assert.equal(init?.redirect, "manual");
  assert.ok(init?.signal);
  const url = new URL(String(input));
  if (url.pathname === "/login") return new Response("", { headers });
  if (url.pathname.startsWith("/api")) {
    const foreign = new Headers(init?.headers).has("origin");
    return Response.json({ error: { code: foreign ? "FORBIDDEN" : "UNAUTHORIZED" } }, { status: foreign ? 403 : 401 });
  }
  return new Response(null, { status: 307, headers: { location: "/login", "cache-control": "private, no-store" } });
};

test("deployment verification checks HTTPS, cache/headers and API denial with bounded requests", async () => {
  await verifyDeployment("https://deployment.example", fetcher);
});

test("deployment verification rejects unsafe origins before making requests", async () => {
  let requests = 0;
  for (const origin of ["http://deployment.example", "https://user:pass@deployment.example", "https://deployment.example/?token=secret", "https://deployment.example/path"]) {
    await assert.rejects(verifyDeployment(origin, async () => { requests++; return new Response(); }));
  }
  assert.equal(requests, 0);
});

test("deployment verification fails missing HSTS, public caching and unexpected cross-site access", async () => {
  for (const defect of ["hsts", "cache", "cross-site"]) {
    await assert.rejects(verifyDeployment("https://deployment.example", async (input, init) => {
      const response = await fetcher(input, init);
      if (defect === "hsts") response.headers.delete("strict-transport-security");
      if (defect === "cache") response.headers.delete("cache-control");
      if (defect === "cross-site" && new Headers(init?.headers).has("origin")) return Response.json({ success: true });
      return response;
    }));
  }
});
