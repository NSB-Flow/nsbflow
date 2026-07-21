import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

type Size = "sm" | "md";

interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  /** Pin the header to the top of the viewport. Default true. */
  sticky?: boolean;
  /**
   * Apply iOS safe-area padding (notch + landscape sides).
   * Default true — keep on for all top-of-screen headers.
   */
  safeArea?: boolean;
  /** min-h-14 (sm, app chrome) or min-h-16 (md, marketing). Default md. */
  size?: Size;
  /** Left slot (logo, sidebar trigger, breadcrumb). */
  left?: ReactNode;
  /** Right slot (actions, theme toggle, avatar). */
  right?: ReactNode;
  /** Custom content overrides left/right. */
  children?: ReactNode;
}

const SIZE = {
  sm: "min-h-14 px-4",
  md: "min-h-16 px-6",
} satisfies Record<Size, string>;

/**
 * Shared header for every route. Opt-in safe-area padding via `safeArea`
 * (default on), configurable size, and sticky-with-backdrop by default.
 * Use `left`/`right` slots for the common two-column layout or `children`
 * for a custom internal structure.
 */
export function PageHeader({
  sticky = true,
  safeArea = true,
  size = "md",
  left,
  right,
  children,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-b flex items-center gap-3",
        SIZE[size],
        safeArea && "safe-top safe-x",
        sticky && "sticky top-0 z-10 bg-background/80 backdrop-blur",
        className,
      )}
      {...rest}
    >
      {children ?? (
        <>
          <div className="flex min-w-0 items-center gap-3">{left}</div>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </>
      )}
    </header>
  );
}
