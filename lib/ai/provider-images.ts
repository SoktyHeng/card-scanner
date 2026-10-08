import "server-only";
import type { ExtractionImage } from "./types";

function dataUrl(image: ExtractionImage) {
  return `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}
export function responseImageContent(front: ExtractionImage, back?: ExtractionImage) {
  return [
    { type: "input_text", text: back ? "Front side of this card:" : "Extract only the information visible on this card." },
    { type: "input_image", detail: "high", image_url: dataUrl(front) },
    ...(back ? [{ type: "input_text", text: "Back side of the same card:" }, { type: "input_image", detail: "high", image_url: dataUrl(back) }] : []),
  ];
}
export function chatImageContent(front: ExtractionImage, back?: ExtractionImage) {
  return [
    { type: "text", text: back ? "Front side of this card:" : "Extract only the information visible on this card." },
    { type: "image_url", image_url: { url: dataUrl(front) } },
    ...(back ? [{ type: "text", text: "Back side of the same card:" }, { type: "image_url", image_url: { url: dataUrl(back) } }] : []),
  ];
}
