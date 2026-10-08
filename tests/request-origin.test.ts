import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOriginRequest } from "../lib/auth/request-origin";

test("origin checks support LAN/proxy Host consistently and reject forwarded-host spoofing and cross-site metadata", () => {
  const request = (headers: Record<string, string> = {}) => new Request("http://internal/api/cards", { headers });
  assert.equal(isSameOriginRequest(request()), true);
  assert.equal(isSameOriginRequest(request({ host: "192.168.1.121:3000", origin: "http://192.168.1.121:3000" })), true);
  assert.equal(isSameOriginRequest(request({ host: "cards.example.com", origin: "https://cards.example.com", "x-forwarded-proto": "https" })), true);
  assert.equal(isSameOriginRequest(request({ host: "cards.example.com", origin: "http://cards.example.com", "x-forwarded-proto": "https" })), false);
  for (const origin of ["https://attacker.example", "null", "file://internal", "https://name:password@internal", "http://internal/path"]) {
    assert.equal(isSameOriginRequest(request({ origin })), false);
  }
  assert.equal(isSameOriginRequest(request({ origin: "https://attacker.example", "x-forwarded-host": "attacker.example" })), false);
  assert.equal(isSameOriginRequest(request({ "sec-fetch-site": "cross-site" })), false);
});
