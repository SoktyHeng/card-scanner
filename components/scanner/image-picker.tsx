"use client";

import { useId, useRef, type ChangeEvent } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT } from "@/lib/utils/image";

export function ImagePicker({
  mode,
  hasImage,
  disabled,
  onSelect,
  side,
}: {
  mode: "camera" | "upload";
  hasImage: boolean;
  disabled: boolean;
  onSelect: (file: File | undefined) => void;
  side?: "front" | "back";
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const camera = mode === "camera";
  const label = camera
    ? hasImage
      ? "Retake photo"
      : "Take photo"
    : hasImage
      ? "Replace image"
      : "Choose image";

  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Reset so picking the same file again still fires a change event.
    event.currentTarget.value = "";
    onSelect(file);
  }

  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        accept={camera ? "image/*" : IMAGE_ACCEPT}
        capture={camera ? "environment" : undefined}
        disabled={disabled}
        aria-label={side ? `${camera ? "Capture" : "Upload"} ${side} card ${camera ? "photo" : "image"}` : camera ? "Capture card photo" : "Upload card image"}
        className="sr-only"
        tabIndex={-1}
        onChange={change}
      />
      <Button
        type="button"
        variant={camera ? "default" : "outline"}
        className="w-full sm:w-auto"
        disabled={disabled}
        aria-controls={id}
        onClick={() => input.current?.click()}
      >
        {camera ? <Camera aria-hidden="true" /> : <Upload aria-hidden="true" />}
        {label}
      </Button>
    </>
  );
}
