"use client";

import { cn } from "@/lib/utils";

type ImagesBadgeProps = {
  text?: string;
  images: string[];
  className?: string;
};

export function ImagesBadge({ text, images, className }: ImagesBadgeProps) {
  return (
    <span className={cn("group inline-flex max-w-full items-center gap-2", className)}>
      <span className="relative h-11 w-14 shrink-0">
        <span className="absolute bottom-0 left-1/2 h-3 w-8 -translate-x-1/2 rounded-b-md rounded-t-sm bg-amber-500 shadow-[0_8px_18px_rgba(245,158,11,0.22)]" />
        <span className="absolute bottom-2 left-1/2 h-3 w-9 -translate-x-1/2 rounded-md bg-amber-400" />
        {images.slice(0, 3).map((image, index) => {
          const positions = [
            "-left-0.5 top-1 -rotate-12 group-hover:-translate-y-1 group-hover:-rotate-[16deg]",
            "left-4 top-0 rotate-2 group-hover:-translate-y-1.5 group-hover:rotate-0",
            "right-0 top-1 rotate-12 group-hover:-translate-y-1 group-hover:rotate-[16deg]",
          ];

          return (
            <img
              key={`${image}-${index}`}
              src={image}
              alt=""
              className={cn(
                "absolute h-6 w-8 animate-card-float rounded-[3px] border border-white/80 bg-white object-cover shadow-md transition-transform duration-300",
                positions[index],
              )}
              style={{ animationDelay: `${index * 120}ms` }}
              draggable={false}
            />
          );
        })}
      </span>
      {text ? <span className="truncate">{text}</span> : null}
    </span>
  );
}
