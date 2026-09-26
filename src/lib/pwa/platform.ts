/**
 * What kind of browser the web build is running in - the iPhone-specific
 * bits (install hint, focus zoom) only apply to iOS, and only while the
 * app isn't installed yet. Pure functions over what the browser reports,
 * so they're testable without one.
 */

export interface BrowserInfo {
  userAgent: string;
  /** `navigator.maxTouchPoints` - iPadOS reports a Mac user agent, so this tells them apart. */
  maxTouchPoints: number;
  /** `display-mode: standalone` matched, or iOS's own `navigator.standalone`. */
  standalone: boolean;
  /** Running inside the Android app (Capacitor), where none of this applies. */
  native: boolean;
}

export function isIOS(info: BrowserInfo): boolean {
  if (info.native) return false;
  if (/iPhone|iPad|iPod/.test(info.userAgent)) return true;
  // iPadOS 13+ asks for the desktop site: a Macintosh UA with a touch screen.
  return /Macintosh/.test(info.userAgent) && info.maxTouchPoints > 1;
}

/** Safari itself, not Chrome/Firefox/Edge on iOS (which can't add to the home screen the same way before iOS 16.4) or an in-app browser. */
export function isIOSSafari(info: BrowserInfo): boolean {
  return isIOS(info) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV/.test(info.userAgent);
}

/** Show the "Add to Home Screen" instructions: iOS, in a browser tab. */
export function shouldOfferIOSInstall(info: BrowserInfo): boolean {
  return isIOS(info) && !info.standalone;
}

export function readBrowserInfo(native: boolean): BrowserInfo {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { userAgent: "", maxTouchPoints: 0, standalone: false, native };
  }
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone, native };
}
