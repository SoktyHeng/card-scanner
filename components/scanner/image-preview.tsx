"use client";
import { T, useLanguage } from "@/components/i18n/language-provider";

import Image from "next/image";
import type { ImageSelection } from "@/lib/utils/image";
export function ImagePreview({ image }: {
    image: ImageSelection;
}) {
    const { t, number } = useLanguage();
    return (<figure className="space-y-3">
      <div className="flex min-h-52 items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-3 sm:min-h-72">
        <Image src={image.previewUrl} alt={t("Selected card image")} width={image.width} height={image.height} unoptimized className="max-h-[28rem] w-full object-contain"/>
      </div>
      <figcaption className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 break-all">
          {image.file.name || <T text={"Card photo"}/>}
        </span>
        <span>
          {number(image.file.size / (1024 * 1024), {minimumFractionDigits: 2, maximumFractionDigits: 2})}<T text={" MB \u00B7 "}/>{number(image.width)}<T text={" \u00D7"}/>{" "}
          {number(image.height)}
        </span>
      </figcaption>
    </figure>);
}
