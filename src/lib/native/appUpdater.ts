/**
 * The page's side of the self-update plugin (`plugins/app-updater`).
 * Android only - the web app updates through its service worker instead.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface AppUpdaterPlugin {
  download(options: { url: string; sha256: string }): Promise<{ bytes: number }>;
  install(): Promise<{ status: "started" | "needs-permission" }>;
  addListener(event: "progress", listener: (e: { fraction: number }) => void): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");

export const appUpdaterSupported = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
