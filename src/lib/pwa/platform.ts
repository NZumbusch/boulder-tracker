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

export type IOSBrowser = "safari" | "chrome" | "firefox" | "edge" | "other";

/** Which browser an iPhone/iPad is running - they each put "add to Home Screen" in a different place. */
export function iosBrowser(info: BrowserInfo): IOSBrowser {
  const ua = info.userAgent;
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS/.test(ua)) return "firefox";
  if (/EdgiOS/.test(ua)) return "edge";
  if (/OPiOS|OPT\/|DuckDuckGo|Brave/.test(ua)) return "other";
  return "safari";
}

/** Apps whose built-in browser names itself in the user agent. */
const IN_APP_TOKENS = /Reddit|FBAN|FBAV|FB_IAB|Instagram|Twitter|TikTok|musical_ly|BytedanceWebview|LinkedInApp|Snapchat|Pinterest|MicroMessenger|Telegram|GSA\/|\bLine\//;

/**
 * A browser built into another app (Reddit, Instagram, Facebook, TikTok…).
 * They can't add to the Home Screen or install a web app, and their storage
 * is separate from the real browser's, so data entered there is stranded.
 *
 * Best effort: a few apps (Reddit on iOS by default) open Safari's own
 * in-app view, whose user agent is the same as Safari's, and can't be told apart.
 */
export function isInAppBrowser(info: BrowserInfo): boolean {
  if (info.native) return false;
  const ua = info.userAgent;
  if (IN_APP_TOKENS.test(ua)) return true;
  // Android System WebView marks itself "; wv)" - Chrome and Chrome Custom Tabs don't.
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true;
  // iOS web views leave out the "Safari/" token every real browser has. An installed
  // Home Screen app leaves it out too, hence the standalone check.
  if (isIOS(info) && !info.standalone && !/Safari\//.test(ua)) return true;
  return false;
}

/** A link that asks Android to open this page in Chrome (works from most in-app browsers). */
export function chromeIntentUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const scheme = url.protocol.slice(0, -1);
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  } catch {
    return null;
  }
}

/** Show the "Add to Home Screen" instructions: iOS, in a browser tab. */
export function shouldOfferIOSInstall(info: BrowserInfo): boolean {
  return isIOS(info) && !info.standalone;
}

/** Android, in a browser (not inside the Android app itself). */
export function isAndroidWeb(info: BrowserInfo): boolean {
  return !info.native && /Android/.test(info.userAgent);
}

/** Show the "Get the Android app" card: the web build on an Android phone or tablet. */
export function shouldOfferAndroidApp(info: BrowserInfo): boolean {
  return isAndroidWeb(info);
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
