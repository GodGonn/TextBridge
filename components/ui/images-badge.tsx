"use client";

import { cn } from "@/lib/utils";

type ImagesBadgeProps = {
  text?: string;
  images: string[];
  className?: string;
};

export function ImagesBadge({ text, images, className }: ImagesBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-slate-700 bg-black/80 px-2 py-1 text-xs font-medium text-slate-100 shadow-sm",
        className,
      )}
    >
      <span className="flex -space-x-2">
        {images.slice(0, 3).map((image, index) => (
          <img
            key={`${image}-${index}`}
            src={image}
            alt=""
            className="size-5 rounded-full border border-slate-900 object-cover"
            draggable={false}
          />
        ))}
      </span>
      {text ? <span className="truncate">{text}</span> : null}
    </span>
  );
}
