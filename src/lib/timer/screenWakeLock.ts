/**
 * Keeps the screen on while a timer runs - the standard Web Wake Lock API
 * rather than a native plugin: Capacitor renders in a system WebView, and
 * modern Android/iOS WebViews support `navigator.wakeLock`. Degrades
 * silently where it isn't supported.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      // The OS drops the lock whenever the page is hidden; forget it, so
      // the next acquire actually asks again.
      this.sentinel.addEventListener?.("release", () => { this.sentinel = null; });
    } catch {
      this.sentinel = null;
    }
  }

  release(): void {
    this.sentinel?.release().catch(() => {});
    this.sentinel = null;
  }
}
