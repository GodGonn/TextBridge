import { cn } from "@/lib/utils";

type GridBackgroundProps = React.ComponentProps<"div"> & {
  size?: number;
};

export function GridBackground({
  size = 32,
  className,
  style,
  ...props
}: GridBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 size-full [mask-image:radial-gradient(ellipse_at_center,black,transparent_74%)]",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(to right, var(--th-grid-fill) 1px, transparent 1px), linear-gradient(to bottom, var(--th-grid-fill) 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        ...style,
      }}
      {...props}
    />
  );
}
