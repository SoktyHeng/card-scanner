"use client";

import { useEffect, useRef, useState } from "react";
import {
  extractionMessages,
  extractionResponseSchema,
} from "@/lib/ai/card-schema";
import type { ExtractedCard } from "@/lib/ai/types";
import { EXTRACTION_CLIENT_TIMEOUT_MS } from "@/lib/ai/timeouts";
import {
  createImagePreview,
  ImageValidationError,
  releaseImagePreview,
  type ImageSelection,
} from "@/lib/utils/image";

type ScanState =
  | { status: "idle"; image: null; message: null }
  | { status: "validating"; image: ImageSelection | null; message: null }
  | { status: "image_selected"; image: ImageSelection; message: null }
  | { status: "extracting"; image: ImageSelection; message: null }
  | { status: "extracted"; image: ImageSelection; message: null }
  | { status: "extraction_error"; image: ImageSelection; message: string }
  | { status: "error"; image: ImageSelection | null; message: string };

export function useCardScanner() {
  const [state, setState] = useState<ScanState>({
    status: "idle",
    image: null,
    message: null,
  });
  const activeImage = useRef<ImageSelection | null>(null);
  const selectionVersion = useRef(0);
  const pendingSelection = useRef<AbortController | null>(null);
  const pendingExtraction = useRef<AbortController | null>(null);
  const [result, setResult] = useState<ExtractedCard | null>(null);

  useEffect(
    () => () => {
      selectionVersion.current += 1;
      pendingSelection.current?.abort();
      pendingExtraction.current?.abort();
      pendingExtraction.current = null;
      releaseImagePreview(activeImage.current);
      activeImage.current = null;
    },
    [],
  );

  async function selectImage(file: File | undefined) {
    // Canceling the native picker must leave the current preview intact.
    if (!file) return;
    if (pendingExtraction.current) return;
    const version = ++selectionVersion.current;
    pendingSelection.current?.abort();
    const controller = new AbortController();
    pendingSelection.current = controller;
    setState({
      status: "validating",
      image: activeImage.current,
      message: null,
    });
    try {
      const image = await createImagePreview(file, controller.signal);
      if (version !== selectionVersion.current) {
        releaseImagePreview(image);
        return;
      }
      releaseImagePreview(activeImage.current);
      activeImage.current = image;
      setResult(null);
      setState({ status: "image_selected", image, message: null });
    } catch (error: unknown) {
      if (version !== selectionVersion.current) return;
      const message =
        error instanceof ImageValidationError
          ? error.message
          : "Unable to preview this image. Please try another image.";
      setState({
        status: "error",
        image: activeImage.current,
        message: activeImage.current
          ? `${message} Your previous image is still selected.`
          : message,
      });
    } finally {
      if (version === selectionVersion.current) pendingSelection.current = null;
    }
  }

  function removeImage() {
    selectionVersion.current += 1;
    pendingSelection.current?.abort();
    pendingSelection.current = null;
    pendingExtraction.current?.abort();
    pendingExtraction.current = null;
    setResult(null);
    releaseImagePreview(activeImage.current);
    activeImage.current = null;
    setState({ status: "idle", image: null, message: null });
  }

  async function extract() {
    if (
      !activeImage.current ||
      pendingSelection.current ||
      pendingExtraction.current
    )
      return;
    const image = activeImage.current;
    const controller = new AbortController();
    pendingExtraction.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(EXTRACTION_CLIENT_TIMEOUT_MS),
    ]);
    setResult(null);
    setState({ status: "extracting", image, message: null });
    try {
      const form = new FormData();
      form.append("image", image.file);
      const response = await fetch("/api/cards/extract", {
        method: "POST",
        body: form,
        signal,
      });
      const parsed = extractionResponseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error(extractionMessages.EXTRACTION_FAILED);
      if (!parsed.data.success)
        throw new Error(extractionMessages[parsed.data.error.code]);
      if (!response.ok) throw new Error(extractionMessages.EXTRACTION_FAILED);
      if (pendingExtraction.current !== controller) return;
      setResult(parsed.data.data);
      setState({ status: "extracted", image, message: null });
    } catch (error: unknown) {
      if (pendingExtraction.current !== controller) return;
      setState({
        status: "extraction_error",
        image,
        message: signal.aborted
          ? extractionMessages.EXTRACTION_TIMEOUT
          : error instanceof Error &&
              Object.values(extractionMessages).some(
                (message) => message === error.message,
              )
            ? error.message
            : "Unable to reach extraction. Check your connection and try again.",
      });
    } finally {
      if (pendingExtraction.current === controller)
        pendingExtraction.current = null;
    }
  }

  return { state, result, selectImage, removeImage, extract };
}
