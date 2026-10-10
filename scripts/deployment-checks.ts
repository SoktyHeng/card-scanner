import assert from "node:assert/strict";

export async function verifyDeployment(origin: string, fetcher: typeof fetch = fetch) {
  const url = new URL(origin);
  assert.equal(url.protocol, "https:", "Supply the deployed HTTPS origin");
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "Supply an origin without credentials, query or path");
  const request = (path: string, init?: RequestInit) => fetcher(new URL(path, url), {
    ...init, redirect: "manual", signal: AbortSignal.timeout(15_000),
  });
  const login = await request("/login");
  assert.equal(login.status, 200, "Login must be served directly over HTTPS");
  assert.equal(login.headers.get("x-content-type-options"), "nosniff");
  assert.equal(login.headers.get("x-frame-options"), "DENY");
  assert.equal(login.headers.get("referrer-policy"), "no-referrer");
  assert.match(login.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(login.headers.get("permissions-policy") ?? "", /camera=\(self\)/);
  const hsts = login.headers.get("strict-transport-security") ?? "";
  assert.ok(Number(hsts.match(/(?:^|;)\s*max-age=(\d+)/i)?.[1]) > 0, "Configure HSTS at the HTTPS host/proxy");
  console.log("PASS: Deployed HTTPS login and security headers (including HSTS)");
  for (const path of ["/dashboard", "/scan", "/cards"]) {
    const response = await request(path);
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location") ?? "", url);
    assert.equal(location.origin, url.origin);
    assert.equal(location.pathname, "/login");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  console.log("PASS: Deployed protected routes redirect locally and disable caching");
  for (const path of ["/api/cards", "/api/cards/extract"]) {
    const anonymous = await request(path, { method: "POST" });
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error.code, "UNAUTHORIZED");
    const foreign = await request(path, { method: "POST", headers: { Origin: "https://outside.invalid", "Sec-Fetch-Site": "cross-site", "X-Forwarded-Host": "outside.invalid" } });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error.code, "FORBIDDEN");
  }
  console.log("PASS: Deployed APIs deny anonymous and cross-site requests");

}
