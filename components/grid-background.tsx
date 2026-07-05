import { cn } from "@/lib/utils";

type GridBackgroundProps = React.ComponentProps<"div"> & {
  size?: number;
  fill?: string;
};

export function GridBackground({
  size = 32,
  fill = "rgba(14, 165, 233, 0.16)",
  className,
  style,
  ...props
}: GridBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 size-full [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(to right, ${fill} 1px, transparent 1px), linear-gradient(to bottom, ${fill} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        ...style,
      }}
      {...props}
    />
  );
}
