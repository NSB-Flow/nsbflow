// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        // Manifest lives in public/manifest.webmanifest already; disable plugin manifest emission.
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/~oauth/,
            /^\/sitemap\.xml/,
            /^\/robots\.txt/,
            /^\/llms\.txt/,
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          runtimeCaching: [
            {
              // HTML navigations — always try network first for freshness.
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "nsb-html",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // Same-origin hashed static assets.
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin &&
                ["style", "script", "worker", "font"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "nsb-assets",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url, request }) =>
                url.origin === self.location.origin && request.destination === "image",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "nsb-images",
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Lovable CDN assets (logos, uploaded images).
              urlPattern: /^https:\/\/[^/]+\/__l5e\/assets-v1\//,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "nsb-cdn",
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
