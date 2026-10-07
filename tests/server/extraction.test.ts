import assert from "node:assert/strict";
import { afterEach, before, mock, test } from "node:test";
import sharp from "sharp";
import { createExtractionHandler } from "../../lib/ai/extraction-handler";
import { extractCard } from "../../lib/ai/card-extractor";
import { getAiEnv } from "../../lib/ai/env";
import { EXTRACTION_TIMEOUT_MS, EXTRACTION_CLIENT_TIMEOUT_MS } from "../../lib/ai/timeouts";
import { ExtractionError } from "../../lib/ai/errors";
import { OpenAiCardExtractor } from "../../lib/ai/openai-card-extractor";
import { MAX_MULTIPART_BYTES, readExtractionImage } from "../../lib/ai/upload";
import { MAX_IMAGE_BYTES } from "../../lib/utils/image";
import { businessCard, emptyCard } from "../fixtures/extraction";
import type { CardExtractor, ExtractionImage } from "../../lib/ai/types";

let png: Buffer, jpeg: Buffer, webp: Buffer;
before(async () => {
  const image = sharp({
    create: { width: 12, height: 8, channels: 3, background: "white" },
  });
  [png, jpeg, webp] = await Promise.all([
    image.clone().png().toBuffer(),
    image.clone().jpeg().toBuffer(),
    image.clone().webp().toBuffer(),
  ]);
});
afterEach(() => mock.restoreAll());
function request(file?: File, extra?: File) {
  const form = new FormData();
  if (file) form.append("image", file);
  if (extra) form.append("image", extra);
  return new Request("http://localhost:3000/api/cards/extract", {
    method: "POST",
    body: form,
  });
}
function file(bytes: Uint8Array, name = "card.png", type = "image/png") {
  return new File([new Uint8Array(bytes)], name, { type });
}
const signal = () => new AbortController().signal;
const providerResponse = (text: string, status = "completed") =>
  Response.json({
    status,
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  });

test("server decodes JPEG/PNG/WEBP and derives MIME from content", async () => {
  for (const [bytes, mime] of [
    [png, "image/png"],
    [jpeg, "image/jpeg"],
    [webp, "image/webp"],
  ] as const) {
    const result = await readExtractionImage(
      request(file(bytes, "fake.pdf", "text/plain")),
    );
    assert.equal(result.mimeType, mime);
    assert.deepEqual(result.bytes, bytes);
  }
});

test("upload rejects missing/duplicate files, fake/corrupt content and files above 10 MB", async () => {
  for (const input of [
    request(),
    request(file(png), file(png)),
    request(file(new Uint8Array())),
    request(file(Buffer.from("%PDF-1.7"))),
    request(file(png.subarray(0, 16))),
    request(file(Buffer.from("<svg></svg>"))),
    request(file(Buffer.from("GIF89a"))),
    new Request("http://localhost:3000/api/cards/extract", {
      method: "POST",
      body: "invalid",
    }),
    new Request("http://localhost:3000/api/cards/extract", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=missing" },
      body: "bad body",
    }),
  ])
    await assert.rejects(readExtractionImage(input), ExtractionError);
  await assert.rejects(
    readExtractionImage(request(file(new Uint8Array(MAX_IMAGE_BYTES + 1)))),
    { code: "IMAGE_TOO_LARGE" },
  );
  const body = new Uint8Array(MAX_MULTIPART_BYTES + 1);
  const chunked = new Request("http://localhost:3000/api/cards/extract", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body,
  });
  await assert.rejects(readExtractionImage(chunked), {
    code: "IMAGE_TOO_LARGE",
  });
  const huge = await sharp({
    create: { width: 6400, height: 6400, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(readExtractionImage(request(file(huge))), {
    code: "INVALID_IMAGE",
  });
});

test("unauthenticated/expired sessions cannot read uploads or call AI; auth outage is controlled", async () => {
  let called = 0;
  const extract = async () => {
    called++;
    return emptyCard();
  };
  const denied = createExtractionHandler({
    authenticate: async () => false,
    extract,
  });
  const response = await denied(request(file(png)));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  assert.equal(called, 0);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const unavailable = createExtractionHandler({
    authenticate: async () => {
      throw new Error("secret auth detail");
    },
    extract,
  });
  const failed = await unavailable(request(file(png)));
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.code, "AUTH_UNAVAILABLE");
  assert.equal(called, 0);
});

test("authenticated endpoint returns validated structure; invalid uploads never reach provider", async () => {
  let called = 0;
  const handler = createExtractionHandler({
    authenticate: async () => true,
    extract: async () => {
      called++;
      return businessCard();
    },
  });
  const response = await handler(request(file(png)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: businessCard(),
  });
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const invalid = await handler(request(file(Buffer.from("pretend image"))));
  assert.equal(invalid.status, 422);
  assert.equal(called, 1);
  const oversized = await handler(
    request(file(new Uint8Array(MAX_IMAGE_BYTES + 1))),
  );
  assert.equal(oversized.status, 413);
  assert.equal(called, 1);
  const lan = request(file(png));
  lan.headers.set("host", "192.168.1.121:3000");
  lan.headers.set("origin", "http://192.168.1.121:3000");
  assert.equal((await handler(lan)).status, 200);
  assert.equal(called, 2);
  const foreign = request(file(png));
  foreign.headers.set("origin", "https://attacker.example");
  assert.equal((await handler(foreign)).status, 403);
  assert.equal(called, 2);
});

test("provider abstraction validates every output and rejects invented structure", async () => {
  const image: ExtractionImage = { bytes: png, mimeType: "image/png" };
  const valid: CardExtractor = { extract: async () => businessCard() };
  assert.deepEqual(await extractCard(image, signal(), valid), businessCard());
  for (const output of [
    {},
    { ...emptyCard(), extraFields: {} },
    { ...emptyCard(), overallConfidence: 5 },
  ])
    await assert.rejects(
      extractCard(image, signal(), { extract: async () => output }),
      { code: "EXTRACTION_FAILED" },
    );
});

test("endpoint gives extraction two minutes and leaves browser time to receive the response", async () => {
  mock.method(AbortSignal, "timeout", (delay: number) => {
    assert.equal(delay, 120_000);
    return new AbortController().signal;
  });
  assert.equal(EXTRACTION_TIMEOUT_MS, 120_000);
  assert.ok(EXTRACTION_CLIENT_TIMEOUT_MS > 150_000);
  const handler = createExtractionHandler({
    authenticate: async () => true,
    extract: async () => businessCard(),
  });
  assert.equal((await handler(request(file(png)))).status, 200);
});

test("endpoint still cancels timed-out provider requests and returns a controlled 504", async () => {
  mock.method(AbortSignal, "timeout", () => AbortSignal.abort());
  const handler = createExtractionHandler({
    authenticate: async () => true,
    extract: async (_image, signal) => {
      assert.equal(signal.aborted, true);
      throw new ExtractionError("EXTRACTION_TIMEOUT");
    },
  });
  const response = await handler(request(file(png)));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, "EXTRACTION_TIMEOUT");
});

test("OpenAI provider sends original image, strict schema, server config, and disables response storage", async () => {
  let calls = 0;
  const provider = new OpenAiCardExtractor(
    { apiKey: "test-only-key", model: "configured-model" },
    async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-only-key",
      );
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "configured-model");
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(
        body.input[1].content[1].image_url,
        `data:image/png;base64,${png.toString("base64")}`,
      );
      assert.match(body.input[0].content, /Do not invent/);
      return providerResponse(JSON.stringify(businessCard()));
    },
  );
  assert.deepEqual(
    await extractCard(
      { bytes: png, mimeType: "image/png" },
      signal(),
      provider,
    ),
    businessCard(),
  );
  assert.equal(calls, 1);
});

test("provider rate limits, HTTP/network failures, refusal, incomplete and invalid output return safe errors", async () => {
  const image: ExtractionImage = { bytes: png, mimeType: "image/png" };
  for (const [response, code] of [
    [new Response("secret error", { status: 401 }), "PROVIDER_UNAVAILABLE"],
    [new Response("secret error", { status: 500 }), "PROVIDER_UNAVAILABLE"],
    [new Response("secret error", { status: 429 }), "PROVIDER_RATE_LIMITED"],
    [providerResponse("not JSON"), "EXTRACTION_FAILED"],
    [providerResponse("{}"), "EXTRACTION_FAILED"],
    [providerResponse("{}", "incomplete"), "EXTRACTION_FAILED"],
    [
      Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
      "EXTRACTION_FAILED",
    ],
  ] as const) {
    const provider = new OpenAiCardExtractor(
      { apiKey: "test", model: "test" },
      async () => response,
    );
    await assert.rejects(extractCard(image, signal(), provider), { code });
  }
  const network = new OpenAiCardExtractor(
    { apiKey: "test", model: "test" },
    async () => {
      throw new Error("internal secret");
    },
  );
  await assert.rejects(network.extract(image, signal()), {
    code: "PROVIDER_UNAVAILABLE",
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(network.extract(image, controller.signal), {
    code: "EXTRACTION_TIMEOUT",
  });
});

test("endpoint sanitizes unknown failures and logs no card content or secrets", async () => {
  const logs: unknown[][] = [];
  mock.method(console, "info", (...args: unknown[]) => logs.push(args));
  mock.method(console, "warn", (...args: unknown[]) => logs.push(args));
  for (const failure of [
    new Error("sensitive-provider-secret"),
    new ExtractionError("PROVIDER_RATE_LIMITED"),
    new ExtractionError("EXTRACTION_TIMEOUT"),
    new ExtractionError("PROVIDER_QUOTA_EXCEEDED"),
  ]) {
    const handler = createExtractionHandler({
      authenticate: async () => true,
      extract: async () => {
        throw failure;
      },
    });
    const response = await handler(request(file(png)));
    assert.ok(response.status >= 400);
    assert.equal(
      (await response.text()).includes("sensitive-provider-secret"),
      false,
    );
    if (
      failure instanceof ExtractionError &&
      failure.code === "PROVIDER_RATE_LIMITED"
    )
      assert.equal(response.headers.get("retry-after"), "30");
    if (failure instanceof ExtractionError && failure.code === "PROVIDER_QUOTA_EXCEEDED") {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("retry-after"), null);
    }
  }
  const good = createExtractionHandler({
    authenticate: async () => true,
    extract: async () => businessCard(),
  });
  await good(request(file(png)));
  const logged = JSON.stringify(logs);
  assert.equal(logged.includes("JOHN"), false);
  assert.equal(logged.includes("sensitive-provider-secret"), false);
  assert.equal(logged.includes(png.toString("base64")), false);
});

test("missing AI environment is a controlled configuration error", () => {
  const priorKey = process.env.AI_API_KEY,
    priorModel = process.env.AI_MODEL;
  try {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    assert.throws(getAiEnv, { code: "AI_NOT_CONFIGURED" });
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "configured-model";
    assert.deepEqual(getAiEnv(), {
      provider: "openai",
      apiKey: "test-key",
      model: "configured-model",
    });
  } finally {
    if (priorKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = priorKey;
    if (priorModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = priorModel;
  }
});
