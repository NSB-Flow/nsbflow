import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { NsbLogo } from "@/components/brand/NsbLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PageHeader } from "./PageHeader";

interface MarketingHeaderProps {
  /** Label for the primary signup CTA. Defaults to "Criar conta". */
  ctaLabel?: string;
  /** Pin to top. Default true. */
  sticky?: boolean;
}

/**
 * Shared marketing/guide header: NsbLogo (linked home) + theme toggle +
 * Entrar / Criar conta buttons. Safe-area aware via PageHeader.
 */
export function MarketingHeader({
  ctaLabel = "Criar conta",
  sticky = true,
}: MarketingHeaderProps) {
  return (
    <PageHeader
      sticky={sticky}
      left={
        <Link to="/" aria-label="Início NSB Flow">
          <NsbLogo />
        </Link>
      }
      right={
        <>
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild>
            <Link to="/auth" search={{ mode: "signup" }}>
              {ctaLabel}
            </Link>
          </Button>
        </>
      }
    />
  );
}
