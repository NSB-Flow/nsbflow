import { cn } from "@/lib/utils";
import logoAsset from "@/assets/nsb-logo.png.asset.json";

/**
 * Logotipo oficial NSB — Growth by Method.
 * `collapsed` mostra apenas o ícone quadrado; full mostra o logotipo horizontal.
 */
export function NsbLogo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <div className="h-9 w-9 rounded-md overflow-hidden shrink-0 shadow-sm ring-1 ring-border/40">
        <img
          src={logoAsset.url}
          alt="NSB Flow - Inteligência Comercial"
          className="h-full w-full object-cover"
          draggable={false}
        />
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

export function NsbLogoFull({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="NSB — Growth by Method"
      className={cn("h-14 w-auto object-contain", className)}
      draggable={false}
    />
  );
}
