import "./fixtures/dom";
import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { CardScanner } from "../components/scanner/card-scanner";
import { useCardScanner } from "../components/scanner/use-card-scanner";
import { createReviewDraft, editStandardField, validateReviewDraft } from "../lib/cards/review";
import { businessCard, emptyCard } from "./fixtures/extraction";
import {
  createImagePreview,
  MAX_IMAGE_BYTES,
  releaseImagePreview,
  validateImageFile,
} from "../lib/utils/image";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
const urls = new Map<string, Blob>();
const revoked: string[] = [];
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
let serial = 0;
let decodeGate: Promise<void> | null = null;
let png: Uint8Array<ArrayBuffer>;
let jpeg: Uint8Array<ArrayBuffer>;
let webp: Uint8Array<ArrayBuffer>;

// jsdom has no image decoder. Sharp fully decodes real fixture bytes in the
// test Image implementation; production uses the browser's Image.decode().
class DecodingImage {
  src = "";
  naturalWidth = 0;
  naturalHeight = 0;
  async decode() {
    const source = this.src;
    if (decodeGate) await decodeGate;
    const blob = urls.get(source);
    assert.ok(blob, "Preview URL must still be live while decoding");
    const { info } = await sharp(Buffer.from(await blob.arrayBuffer()))
      .raw()
      .toBuffer({ resolveWithObject: true });
    this.naturalWidth = info.width;
    this.naturalHeight = info.height;
  }
}

function file(
  bytes: Uint8Array<ArrayBuffer>,
  name = "card.png",
  type = "image/png",
) {
  return new File([bytes], name, { type });
}

function pauseDecoding() {
  let resume!: () => void;
  decodeGate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  return resume;
}

before(async () => {
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    Image: { configurable: true, writable: true, value: DecodingImage },
    IS_REACT_ACT_ENVIRONMENT: {
      configurable: true,
      writable: true,
      value: true,
    },
  });
  URL.createObjectURL = (blob) => {
    assert.ok(blob instanceof Blob);
    const url = `blob:test/${++serial}`;
    urls.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    urls.delete(url);
    revoked.push(url);
  };
  const image = sharp({
    create: { width: 12, height: 8, channels: 3, background: "#087f70" },
  });
  png = Uint8Array.from(await image.clone().png().toBuffer());
  jpeg = Uint8Array.from(await image.clone().jpeg().toBuffer());
  webp = Uint8Array.from(await image.clone().webp().toBuffer());
});

afterEach(() => {
  cleanup();
  decodeGate = null;
  mock.restoreAll();
  assert.equal(urls.size, 0, "Every preview URL must be released");
  revoked.length = 0;
});

after(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
  else Reflect.deleteProperty(globalThis, "Image");
  dom.window.close();
});

test("accepts real JPG/JPEG, PNG and WEBP content, including missing or wrong MIME", async () => {
  for (const [bytes, name, claimed, expected] of [
    [jpeg, "card.jpg", "image/jpeg", "image/jpeg"],
    [jpeg, "card.jpeg", "", "image/jpeg"],
    [png, "card.bin", "text/plain", "image/png"],
    [webp, "card.webp", "image/png", "image/webp"],
  ] as const) {
    const selection = await createImagePreview(file(bytes, name, claimed));
    assert.equal(selection.mimeType, expected);
    assert.equal(selection.width, 12);
    assert.equal(selection.height, 8);
    assert.equal(urls.get(selection.previewUrl)?.type, expected);
    releaseImagePreview(selection);
  }
});

test("rejects unsupported, spoofed, empty, oversized and corrupt image files", async () => {
  for (const input of [
    new File([], "empty.png", { type: "image/png" }),
    new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "fake.jpg", {
      type: "image/jpeg",
    }),
    new File(["%PDF-1.7"], "document.png", { type: "image/png" }),
    new File(["GIF89a"], "animation.gif", { type: "image/gif" }),
  ])
    await assert.rejects(validateImageFile(input), /empty|Unsupported/);
  const oversized = new File(
    [new Uint8Array(MAX_IMAGE_BYTES + 1)],
    "large.png",
  );
  await assert.rejects(validateImageFile(oversized), /10 MB or less/);
  const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
  atLimit.set(png);
  assert.equal(await validateImageFile(file(atLimit)), "image/png");
  await assert.rejects(
    createImagePreview(file(png.slice(0, 16))),
    /damaged or incomplete/,
  );
  assert.equal(urls.size, 0);
  assert.equal(revoked.length, 1, "Failed decoding must revoke its URL");
});

test("camera/upload selection previews, replaces and removes without extraction requests", async () => {
  let requests = 0;
  mock.method(globalThis, "fetch", async () => {
    requests += 1;
    throw new Error("Unexpected network request");
  });
  const view = render(createElement(CardScanner), { reactStrictMode: true });
  const capture = view.getByLabelText("Capture card photo") as HTMLInputElement;
  const upload = view.getByLabelText("Upload card image") as HTMLInputElement;
  assert.equal(capture.getAttribute("capture"), "environment");
  assert.equal(capture.accept, "image/*");
  assert.equal(upload.hasAttribute("capture"), false);
  assert.ok(upload.accept.includes(".webp"));
  assert.equal(
    (
      view.getByRole("button", {
        name: "Extract information",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.change(capture, {
    target: { files: [file(jpeg, "camera.jpeg", "")] },
  });
  await view.findByText("camera.jpeg");
  const firstUrl = view.getByAltText("Selected card image").getAttribute("src");
  assert.ok(firstUrl);
  assert.equal(capture.value, "");
  assert.equal(requests, 0);

  // Canceling a replacement picker leaves the accepted image intact.
  fireEvent.change(upload, { target: { files: [] } });
  assert.equal(
    view.getByAltText("Selected card image").getAttribute("src"),
    firstUrl,
  );
  fireEvent.change(upload, {
    target: { files: [file(webp, "replacement.webp", "image/webp")] },
  });
  await view.findByText("replacement.webp");
  assert.ok(revoked.includes(firstUrl));
  const secondUrl = view
    .getByAltText("Selected card image")
    .getAttribute("src");
  assert.notEqual(secondUrl, firstUrl);
  assert.equal(requests, 0);
  fireEvent.click(view.getByRole("button", { name: "Remove image" }));
  assert.equal(view.queryByAltText("Selected card image"), null);
  assert.ok(secondUrl && revoked.includes(secondUrl));
  assert.equal(
    (
      view.getByRole("button", {
        name: "Extract information",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  // Same-file reselection is supported after reset.
  fireEvent.change(upload, { target: { files: [file(png)] } });
  await view.findByText("card.png");
  view.unmount();
  assert.equal(urls.size, 0);
});

test("invalid selection shows useful errors and preserves a valid earlier preview", async () => {
  const view = render(createElement(CardScanner));
  const upload = view.getByLabelText("Upload card image");
  fireEvent.change(upload, {
    target: {
      files: [new File(["not an image"], "spoofed.png", { type: "image/png" })],
    },
  });
  assert.match(
    (await view.findByRole("alert")).textContent!,
    /Unsupported file content/,
  );
  assert.equal(view.queryByAltText("Selected card image"), null);
  fireEvent.change(upload, { target: { files: [file(png)] } });
  await view.findByText("card.png");
  const oldUrl = view.getByAltText("Selected card image").getAttribute("src");
  fireEvent.change(upload, {
    target: { files: [file(png.slice(0, 16), "corrupt.png")] },
  });
  assert.match(
    (await view.findByRole("alert")).textContent!,
    /previous image is still selected/,
  );
  assert.equal(
    view.getByAltText("Selected card image").getAttribute("src"),
    oldUrl,
  );
  assert.equal(view.queryByText("corrupt.png"), null);
});

test("loading prevents extraction, cancellation releases pending URLs and stale previews", async () => {
  const resume = pauseDecoding();
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), {
    target: { files: [file(png)] },
  });
  await waitFor(() => assert.equal(urls.size, 1));
  assert.ok(view.getByText("Checking image…"));
  assert.equal(
    (
      view.getByRole("button", {
        name: "Extract information",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(
    (view.getByRole("button", { name: "Take photo" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(view.getByRole("button", { name: "Cancel selection" }));
  assert.equal(urls.size, 0, "Cancel immediately revokes the in-flight URL");
  await act(async () => {
    resume();
  });
  assert.equal(view.queryByAltText("Selected card image"), null);
  assert.ok(view.getByText("No image selected"));
});

test("unmount cancels validation and releases pending URLs", async () => {
  const resume = pauseDecoding();
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Capture card photo"), {
    target: { files: [file(jpeg)] },
  });
  await waitFor(() => assert.equal(urls.size, 1));
  view.unmount();
  assert.equal(urls.size, 0);
  await act(async () => {
    resume();
  });
});

test("Extract is explicit, duplicate requests are prevented, and validated results stay in memory", async () => {
  let calls = 0;
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++;
    assert.equal(url, "/api/cards/extract");
    assert.equal(init.method, "POST");
    assert.ok(init.body instanceof FormData);
    const image = init.body.get("image");
    assert.ok(image instanceof File);
    assert.equal(image.size, png.length);
    return pending;
  });
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), {
    target: { files: [file(png)] },
  });
  await view.findByText("card.png");
  assert.equal(calls, 0);
  const extract = view.getByRole("button", { name: "Extract information" });
  fireEvent.click(extract);
  fireEvent.click(extract);
  assert.equal(calls, 1);
  assert.equal(
    (view.getByRole("button", { name: "Analyzing card…" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  assert.equal(
    (view.getByRole("button", { name: "Replace image" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await act(async () => {
    finish(Response.json({ success: true, data: businessCard() }));
  });
  assert.ok(view.getByDisplayValue("JOHN SMITH"));
  assert.ok(view.getByDisplayValue("EMP-1001"));
  assert.ok(view.getByText(/Nothing has been saved/));
  assert.equal(calls, 1);
  fireEvent.change(view.getByLabelText("Upload card image"), {
    target: { files: [file(webp, "next.webp")] },
  });
  await view.findByText("next.webp");
  assert.equal(view.queryByDisplayValue("JOHN SMITH"), null);
  assert.equal(calls, 1);
});

test("scan review confirmation is invalidated by edits and cleared by re-extraction and removal", async () => {
  let requests = 0;
  mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ success: true, data: businessCard() });
  });
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), { target: { files: [file(png)] } });
  await view.findByText("card.png");
  fireEvent.click(view.getByRole("button", { name: "Extract information" }));
  await view.findByRole("heading", { name: "Review card information" });
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  assert.ok(view.getByText(/Review confirmed\. Nothing has been saved/));
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Corrected name" } });
  assert.equal(view.queryByText(/Review confirmed\. Nothing has been saved/), null);
  assert.equal(requests, 1, "Review and confirmation must not make saving requests");
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  assert.ok(view.getByText(/Review confirmed\. Nothing has been saved/));
  fireEvent.click(view.getByRole("button", { name: "Extract again" }));
  await view.findByDisplayValue("JOHN SMITH");
  assert.equal(view.queryByDisplayValue("Corrected name"), null);
  assert.equal(view.queryByText(/Review confirmed\. Nothing has been saved/), null);
  fireEvent.click(view.getByRole("button", { name: "Remove image" }));
  assert.equal(view.queryByRole("heading", { name: "Review card information" }), null);
  assert.equal(requests, 2);
});

test("Phase 5 handoff retains original file, source text and extraction separately from corrections", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: businessCard() }));
  const original = file(png);
  const hook = renderHook(useCardScanner);
  await act(async () => { await hook.result.current.selectImage(original); });
  await act(async () => { await hook.result.current.extract(); });
  const source = hook.result.current.result!;
  const corrected = validateReviewDraft(editStandardField(createReviewDraft(source), "name", "Corrected"));
  assert.ok(corrected.success);
  act(() => { hook.result.current.confirmReview(corrected.data); });
  const handoff = hook.result.current.reviewedScan!;
  assert.equal(handoff.originalImage, original);
  assert.equal(handoff.rawText, source.rawText);
  assert.equal(handoff.aiExtraction.name, "JOHN SMITH");
  assert.equal(handoff.reviewedData.name, "Corrected");
  assert.equal(hook.result.current.result!.name, "JOHN SMITH");
  act(() => { hook.result.current.invalidateReview(); });
  assert.equal(hook.result.current.reviewedScan, null);
  assert.equal(hook.result.current.state.status, "review");
});

test("save requires confirmation, blocks duplicate clicks, keeps the draft on failure and retries the same submission", async () => {
  let saves = 0;
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const submissionIds: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url === "/api/cards/extract") return Response.json({ success: true, data: businessCard() });
    assert.equal(url, "/api/cards");
    saves++;
    const body = init.body as FormData;
    const input = JSON.parse(String(body.get("data")));
    submissionIds.push(input.submissionId);
    assert.equal(input.reviewConfirmed, true);
    assert.equal(input.aiExtraction.name, "JOHN SMITH");
    assert.equal(input.reviewedData.name, "Corrected name");
    assert.equal((body.get("image") as File).size, png.length);
    return saves === 1 ? pending : Response.json({ success: false, error: { code: "UPLOAD_FAILED", message: "private-provider-error" } }, { status: 503 });
  });
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), { target: { files: [file(png)] } });
  await view.findByText("card.png");
  fireEvent.click(view.getByRole("button", { name: "Extract information" }));
  await view.findByLabelText("Name");
  assert.equal(view.queryByRole("button", { name: "Save card" }), null);
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Corrected name" } });
  fireEvent.click(view.getByRole("button", { name: "Confirm reviewed information" }));
  const save = view.getByRole("button", { name: "Save card" });
  fireEvent.click(save);
  fireEvent.click(save);
  assert.equal(saves, 1);
  assert.equal((view.getByRole("button", { name: "Saving card…" }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByLabelText("Name") as HTMLInputElement).disabled, false);
  assert.ok(view.getByLabelText("Name").closest("fieldset[disabled]"));
  assert.equal((view.getByRole("button", { name: "Remove image" }) as HTMLButtonElement).disabled, true);
  await act(async () => { release(Response.json({ success: false, error: { code: "INSERT_FAILED", message: "secret-error" } }, { status: 503 })); });
  assert.match(view.getByRole("alert").textContent!, /uploaded image was removed/);
  assert.equal(view.queryByText("secret-error"), null);
  assert.ok(view.getByDisplayValue("Corrected name"));
  assert.ok(view.getByAltText("Selected card image"));
  fireEvent.click(view.getByRole("button", { name: "Retry saving card" }));
  await waitFor(() => assert.match(view.getByRole("alert").textContent!, /Unable to upload/));
  assert.equal(saves, 2);
  assert.equal(submissionIds[0], submissionIds[1]);
  fireEvent.change(view.getByLabelText("Name"), { target: { value: "Another correction" } });
  assert.equal(view.queryByRole("button", { name: "Retry saving card" }), null);
});

test("successful save returns a card destination and prevents another submission", async () => {
  const id = "00000000-0000-4000-8000-000000000003";
  let saves = 0;
  mock.method(globalThis, "fetch", async (url: string) => {
    if (url === "/api/cards/extract") return Response.json({ success: true, data: businessCard() });
    saves++;
    return Response.json({ success: true, id }, { status: 201 });
  });
  const hook = renderHook(useCardScanner);
  await act(async () => { await hook.result.current.selectImage(file(png)); });
  await act(async () => { await hook.result.current.extract(); });
  await act(async () => { assert.equal(await hook.result.current.save(), null); });
  const review = validateReviewDraft(createReviewDraft(hook.result.current.result!));
  assert.ok(review.success);
  act(() => { hook.result.current.confirmReview(review.data); });
  await act(async () => { assert.equal(await hook.result.current.save(), id); });
  assert.equal(hook.result.current.state.status, "completed");
  assert.equal(await hook.result.current.save(), null);
  assert.equal(saves, 1);
});

test("provider errors allow manual retry; empty validated results do not fabricate fields", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1
      ? Response.json(
          {
            success: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "internal provider detail",
            },
          },
          { status: 502 },
        )
      : Response.json({ success: true, data: emptyCard() });
  });
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), {
    target: { files: [file(png)] },
  });
  await view.findByText("card.png");
  fireEvent.click(view.getByRole("button", { name: "Extract information" }));
  assert.match(
    (await view.findByRole("alert")).textContent!,
    /temporarily unavailable/,
  );
  assert.equal(view.queryByText("internal provider detail"), null);
  assert.equal(calls, 1);
  assert.ok(view.getByAltText("Selected card image"));
  fireEvent.click(view.getByRole("button", { name: "Retry extraction" }));
  await view.findByText(/No readable fields were found/);
  assert.equal(calls, 2);
  assert.equal(view.queryByRole("alert"), null);
  assert.equal(view.queryByText("JOHN SMITH"), null);
});

test("invalid provider responses and network errors never become successful results", async () => {
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1)
      return Response.json({
        success: true,
        data: { name: "Fabricated success" },
      });
    throw new Error("private network diagnostic");
  });
  const view = render(createElement(CardScanner));
  fireEvent.change(view.getByLabelText("Upload card image"), {
    target: { files: [file(png)] },
  });
  await view.findByText("card.png");
  fireEvent.click(view.getByRole("button", { name: "Extract information" }));
  await view.findByRole("alert");
  assert.equal(view.queryByText("Fabricated success"), null);
  fireEvent.click(view.getByRole("button", { name: "Retry extraction" }));
  await waitFor(() =>
    assert.match(view.getByRole("alert").textContent!, /Check your connection/),
  );
  assert.equal(view.queryByText("private network diagnostic"), null);
});

test("canceling or unmounting extraction aborts the request and ignores late responses", async () => {
  const signals: AbortSignal[] = [];
  const finish: Array<(response: Response) => void> = [];
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    return new Promise<Response>((resolve) => {
      finish.push(resolve);
    });
  });
  const view = render(createElement(CardScanner));
  for (let index = 0; index < 2; index++) {
    fireEvent.change(view.getByLabelText("Upload card image"), {
      target: { files: [file(png)] },
    });
    await view.findByText("card.png");
    fireEvent.click(view.getByRole("button", { name: "Extract information" }));
    if (index === 0)
      fireEvent.click(
        view.getByRole("button", {
          name: "Cancel extraction and remove image",
        }),
      );
    else view.unmount();
    assert.equal(signals[index].aborted, true);
    await act(async () => {
      finish[index](Response.json({ success: true, data: businessCard() }));
    });
    assert.equal(view.queryByText("JOHN SMITH"), null);
    assert.equal(urls.size, 0);
  }
});
