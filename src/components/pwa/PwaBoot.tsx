import { useEffect, useState } from "react";
import { registerPwa } from "@/lib/pwa/register";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Registers the service worker after hydration and surfaces
 * an "Nova versão disponível" toast with an "Atualizar agora" button.
 */
export function PwaBoot() {
  const [, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void registerPwa((reload) => {
      if (cancelled) return;
      toast("Nova versão disponível", {
        description: "Recarregue para aplicar as últimas melhorias do NSB Flow.",
        duration: Infinity,
        action: (
          <Button size="sm" onClick={reload}>
            Atualizar agora
          </Button>
        ),
      });
    }).finally(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
