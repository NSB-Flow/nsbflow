import { useEffect, useState } from "react";
import logoAsset from "@/assets/nsb-logo.png.asset.json";

/**
 * Splash screen mostrada apenas quando o app é aberto em modo standalone (PWA).
 * Some após ~1.2s, mantendo o app com sensação nativa.
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center animate-in fade-in duration-300"
      style={{ backgroundColor: "#0A2540", color: "#F5F1E6" }}
    >
      <img
        src={logoAsset.url}
        alt=""
        className="h-24 w-24 rounded-2xl shadow-2xl"
        draggable={false}
      />
      <div className="mt-6 font-display text-2xl font-bold tracking-tight">
        NSB <span style={{ color: "#C9A24C" }}>Flow</span>
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.28em] opacity-70">
        Powered by AI
      </div>
    </div>
  );
}
