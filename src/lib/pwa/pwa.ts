/**
 * Web-only start-up for the installable app: the service worker (offline +
 * "new version" toast), persistent storage, and iOS's focus zoom. Does
 * nothing inside the Android app, which ships its own files and storage.
 */
import { Capacitor } from "@capacitor/core";
import { toast } from "../toast.svelte";
import { isIOS, readBrowserInfo } from "./platform";

export function installPwa(): void {
  if (Capacitor.isNativePlatform()) return;
  const info = readBrowserInfo(false);

  // iOS zooms the page into any field under 16px and doesn't zoom back
  // out; every input here is smaller. maximum-scale=1 stops that focus
  // zoom, and iOS still allows pinch zoom regardless. Not applied
  // elsewhere, since Android Chrome would honour it and block pinch zoom.
  if (isIOS(info)) {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewport && !viewport.content.includes("maximum-scale")) viewport.content += ", maximum-scale=1";
  }

  // Ask the browser not to evict the training data under storage pressure.
  // Safari's 7-day cap on site data doesn't apply to home-screen apps, which
  // is the other reason the welcome screen asks iPhone users to install.
  void navigator.storage?.persist?.().catch(() => undefined);

  if (import.meta.env.PROD && "serviceWorker" in navigator) void registerServiceWorker();
}

async function registerServiceWorker(): Promise<void> {
  const { registerSW } = await import("virtual:pwa-register");
  const update = registerSW({
    // A new build is downloaded and waiting. Never switch under a running
    // session on our own: the toast stays until tapped, and a reload keeps
    // the live session (it's saved as it goes).
    onNeedRefresh() {
      toast.show("A new version is ready.", {
        action: { label: "Reload", run: () => update(true) },
        durationMs: 24 * 60 * 60 * 1000,
      });
    },
  });
}
