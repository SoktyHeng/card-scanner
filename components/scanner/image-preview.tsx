import Image from "next/image";
import type { ImageSelection } from "@/lib/utils/image";

export function ImagePreview({ image }: { image: ImageSelection }) {
  return (
    <figure className="space-y-3">
      <div className="flex min-h-52 items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-3 sm:min-h-72">
        <Image
          src={image.previewUrl}
          alt="Selected card image"
          width={image.width}
          height={image.height}
          unoptimized
          className="max-h-[28rem] w-full object-contain"
        />
      </div>
      <figcaption className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 break-all">
          {image.file.name || "Card photo"}
        </span>
        <span>
          {(image.file.size / (1024 * 1024)).toFixed(2)} MB · {image.width} ×{" "}
          {image.height}
        </span>
      </figcaption>
    </figure>
  );
}
