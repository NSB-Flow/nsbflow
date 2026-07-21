import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

/**
 * Shared page shell. Provides the vertical flex column + background used by
 * every marketing/guide/app route. Compose with <PageHeader /> and pass the
 * body as children.
 */
export function PageLayout({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-h-dvh-safe flex flex-col bg-background", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

interface PageMainProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function PageMain({ children, className, ...rest }: PageMainProps) {
  return (
    <main className={cn("flex-1", className)} {...rest}>
      {children}
    </main>
  );
}
