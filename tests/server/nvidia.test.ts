import assert from "node:assert/strict";
import { test } from "node:test";
import { NvidiaCardExtractor } from "../../lib/ai/nvidia-card-extractor";
import { extractCard } from "../../lib/ai/card-extractor";
import { emptyCard } from "../fixtures/extraction";

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" as const };
const config = { apiKey: "test-secret", model: "meta/muse-glimmer-30b" };
const completion = (content: string, finish_reason = "stop") => Response.json({
  choices: [{ finish_reason, message: { content, reasoning_content: "not JSON" } }],
});

test("NVIDIA Muse Glimmer uses low reasoning, an explicit output budget and the extraction schema", async () => {
  const signal = new AbortController().signal;
  const provider = new NvidiaCardExtractor(config, async (url, init) => {
    assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-secret");
    assert.equal(init?.signal, signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.reasoning_effort, "low");
    assert.deepEqual(body.chat_template_kwargs, { reasoning_strength: "low" });
    assert.equal(body.max_tokens, 8192);
    assert.equal(body.response_format.type, "json_object");
    const schema = JSON.parse(body.messages[0].content.split("\nJSON schema: ")[1]);
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.includes("fieldConfidences"));
    assert.ok(schema.required.includes("extraFields"));
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/png;base64,AQID");
    return completion(JSON.stringify(emptyCard()));
  });
  assert.deepEqual(await extractCard(image, signal, provider), emptyCard());
});

test("NVIDIA model-specific reasoning options are not sent to other models", async () => {
  const provider = new NvidiaCardExtractor({ ...config, model: "another-vision-model" }, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.chat_template_kwargs, undefined);
    return completion(JSON.stringify(emptyCard()));
  });
  await extractCard(image, new AbortController().signal, provider);
});

test("NVIDIA rejects incomplete, invalid and refused output and safely handles upstream failures", async () => {
  for (const [response, code] of [
    [completion(JSON.stringify(emptyCard()), "length"), "EXTRACTION_FAILED"],
    [completion("invalid JSON"), "EXTRACTION_FAILED"],
    [completion("{}"), "EXTRACTION_FAILED"],
    [Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(emptyCard()), refusal: "refused" } }] }), "EXTRACTION_FAILED"],
    [new Response("test-secret", { status: 429 }), "PROVIDER_RATE_LIMITED"],
    [new Response("test-secret", { status: 500 }), "PROVIDER_UNAVAILABLE"],
  ] as const) {
    await assert.rejects(extractCard(image, new AbortController().signal,
      new NvidiaCardExtractor(config, async () => response)), { code });
  }
  const failed = new NvidiaCardExtractor(config, async () => { throw new Error("test-secret"); });
  await assert.rejects(failed.extract(image, AbortSignal.abort()), { code: "EXTRACTION_TIMEOUT" });
});
