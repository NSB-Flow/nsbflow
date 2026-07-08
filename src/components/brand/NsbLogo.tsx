import { cn } from "@/lib/utils";

/**
 * Wordmark tipográfico NSB até o logo oficial ser enviado.
 * Azul marinho + detalhe dourado em "Flow".
 */
export function NsbLogo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <div className="h-8 w-8 rounded-md nsb-gradient flex items-center justify-center shrink-0 shadow-sm">
        <span className="font-display font-bold text-primary-foreground text-sm tracking-tighter">
          N
        </span>
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-none">
          <div className="font-display font-bold text-[15px] tracking-tight">
            NSB <span className="text-gold">Flow</span>
          </div>
          <div className="text-[9px] text-muted-foreground tracking-[0.18em] uppercase mt-0.5">
            Growth by Method
          </div>
        </div>
      )}
    </div>
  );
}
