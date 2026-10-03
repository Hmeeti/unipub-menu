"use client";

import Image from "next/image";
import { useState } from "react";
import { useT } from "@/components/providers/i18n-provider";
import { CategoryIcon } from "@/components/ui/icons";
import type { ImageAsset } from "@/lib/domain/types";
import { imageSrc } from "@/lib/images/loader";
import { cn } from "@/lib/utils";

type Props = {
  image: ImageAsset | undefined;
  alt: string;
  sizes: string;
  icon: string;
  priority?: boolean;
  className?: string;
  muted?: boolean;
};

/** Fixed-ratio photo (parent sets the size) with blur placeholder and a branded fallback. */
export function ItemImage({ image, alt, sizes, icon, priority, className, muted }: Props) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return (
      <div
        className={cn(
          "text-gold-dim flex size-full flex-col items-center justify-center gap-1 bg-[radial-gradient(circle_at_30%_20%,var(--glow-1),transparent_60%),linear-gradient(135deg,var(--surface-2),var(--surface))]",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <CategoryIcon name={icon} className="size-8 opacity-80" />
        <span className="px-2 text-center text-xs">{t("item.photoFallback")}</span>
      </div>
    );
  }
  return (
    <Image
      src={imageSrc(image)}
      alt={alt}
      fill
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      placeholder={image.blur ? "blur" : "empty"}
      blurDataURL={image.blur}
      onError={() => setFailed(true)}
      className={cn("object-cover", muted && "grayscale", className)}
    />
  );
}
