"use client";

import { useEffect, useRef, useState } from "react";
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
  | { status: "extraction_unavailable"; image: ImageSelection; message: string }
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

  useEffect(
    () => () => {
      selectionVersion.current += 1;
      pendingSelection.current?.abort();
      releaseImagePreview(activeImage.current);
      activeImage.current = null;
    },
    [],
  );

  async function selectImage(file: File | undefined) {
    // Canceling the native picker must leave the current preview intact.
    if (!file) return;
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
    releaseImagePreview(activeImage.current);
    activeImage.current = null;
    setState({ status: "idle", image: null, message: null });
  }

  function extract() {
    if (!activeImage.current || state.status === "validating") return;
    // Phase 3 connects this explicit action to the extraction endpoint.
    // Selection never sends the image, starts AI work, or produces fake results.
    setState({
      status: "extraction_unavailable",
      image: activeImage.current,
      message:
        "Extraction is not available yet. Your image is ready to preview, but no information has been extracted or saved.",
    });
  }

  return { state, selectImage, removeImage, extract };
}
