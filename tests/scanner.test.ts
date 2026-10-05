import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { CardScanner } from "../components/scanner/card-scanner";
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
  fireEvent.click(view.getByRole("button", { name: "Extract information" }));
  assert.ok(view.getByText(/no information has been extracted or saved/));
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
