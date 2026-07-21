// Guarded service worker registration for NSB Flow.
// Never registers in dev, iframe preview, or Lovable preview hostnames.
// Exposes ?sw=off kill switch that unregisters and reloads.

const SW_URL = "/sw.js";

function isBlockedHost(host: string): boolean {
  if (!host) return false;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.map(async (r) => {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }),
  );
}

export type UpdateHandler = (reload: () => void) => void;

export async function registerPwa(onUpdateAvailable?: UpdateHandler): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const inIframe = window.self !== window.top;
  const refused =
    !import.meta.env.PROD ||
    inIframe ||
    isBlockedHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refused) {
    await unregisterMatching();
    if (url.searchParams.get("sw") === "off") {
      url.searchParams.delete("sw");
      window.history.replaceState({}, "", url.toString());
    }
    return;
  }

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(SW_URL, { scope: "/" });

    wb.addEventListener("waiting", () => {
      onUpdateAvailable?.(() => {
        wb.addEventListener("controlling", () => window.location.reload());
        wb.messageSkipWaiting();
      });
    });

    await wb.register();
  } catch (err) {
    console.warn("[pwa] register failed", err);
  }
}
