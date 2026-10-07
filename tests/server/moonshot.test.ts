import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { MoonshotCardExtractor } from "../../lib/ai/moonshot-card-extractor";
import { extractCard, createCardExtractor } from "../../lib/ai/card-extractor";
import { emptyCard } from "../fixtures/extraction";

afterEach(() => mock.restoreAll());
const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const };
const config = { apiKey: "test-secret", model: "kimi-k3" };
const signal = () => new AbortController().signal;
const completion = (content: string, finish_reason = "stop") => Response.json({
  choices: [{ finish_reason, message: { content, reasoning_content: "not JSON" } }],
});

test("Moonshot sends vision and strict schema to its own endpoint; parses only final content", async () => {
  const provider = new MoonshotCardExtractor(config, async (url, init) => {
    assert.equal(url, "https://api.moonshot.ai/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-secret");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "kimi-k3");
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/png;base64,AQID");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.ok(init?.signal);
    return completion(JSON.stringify(emptyCard()));
  });
  assert.deepEqual(await extractCard(image, signal(), provider), emptyCard());
});

test("Moonshot failures are controlled and upstream secrets never enter logs or errors", async () => {
  const logs: unknown[][] = [];
  mock.method(console, "warn", (...args: unknown[]) => logs.push(args));
  for (const [response, code] of [
    [new Response("test-secret", { status: 401 }), "PROVIDER_UNAVAILABLE"],
    [new Response("test-secret", { status: 429 }), "PROVIDER_RATE_LIMITED"],
    [new Response("test-secret", { status: 500 }), "PROVIDER_UNAVAILABLE"],
    [Response.json({ error: { type: "exceeded_current_quota_error", message: "test-secret" } }, { status: 429 }), "PROVIDER_QUOTA_EXCEEDED"],
    [Response.json({ error: { type: "rate_limit_reached_error", message: "test-secret" } }, { status: 429 }), "PROVIDER_RATE_LIMITED"],
    [Response.json({ error: { type: "test-secret", message: "test-secret" } }, { status: 429 }), "PROVIDER_RATE_LIMITED"],
    [completion("not JSON"), "EXTRACTION_FAILED"],
    [completion("{}"), "EXTRACTION_FAILED"],
    [completion(JSON.stringify(emptyCard()), "length"), "EXTRACTION_FAILED"],
    [Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}", refusal: "refused" } }] }), "EXTRACTION_FAILED"],
  ] as const) {
    await assert.rejects(extractCard(image, signal(), new MoonshotCardExtractor(config, async () => response)), { code });
  }
  assert.equal(JSON.stringify(logs).includes("test-secret"), false);
  const provider = new MoonshotCardExtractor(config, async () => { throw new Error("test-secret"); });
  await assert.rejects(provider.extract(image, signal()), { code: "PROVIDER_UNAVAILABLE" });
  await assert.rejects(provider.extract(image, AbortSignal.abort()), { code: "EXTRACTION_TIMEOUT" });
});

test("factory selects Moonshot explicitly and rejects unknown providers", () => {
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.AI_API_KEY, model: process.env.AI_MODEL };
  try {
    process.env.AI_PROVIDER = "moonshot";
    process.env.AI_API_KEY = config.apiKey;
    process.env.AI_MODEL = config.model;
    assert.ok(createCardExtractor() instanceof MoonshotCardExtractor);
    process.env.AI_PROVIDER = "unknown";
    assert.throws(createCardExtractor, { code: "AI_NOT_CONFIGURED" });
  } finally {
    for (const [key, value] of Object.entries({ AI_PROVIDER: previous.provider, AI_API_KEY: previous.key, AI_MODEL: previous.model })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
