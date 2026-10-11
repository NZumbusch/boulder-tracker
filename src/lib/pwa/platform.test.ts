import { describe, expect, it } from "vitest";
import { chromeIntentUrl, iosBrowser, isAndroidWeb, isInAppBrowser, isIOS, isIOSSafari, shouldOfferAndroidApp, shouldOfferIOSInstall, type BrowserInfo } from "./platform";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

const info = (userAgent: string, over: Partial<BrowserInfo> = {}): BrowserInfo => ({
  userAgent, maxTouchPoints: 5, standalone: false, native: false, ...over,
});

describe("pwa platform", () => {
  it("recognises iPhone, and iPad asking for the desktop site", () => {
    expect(isIOS(info(IPHONE_SAFARI))).toBe(true);
    expect(isIOS(info(MAC, { maxTouchPoints: 5 }))).toBe(true);
    expect(isIOS(info(MAC, { maxTouchPoints: 0 }))).toBe(false);
    expect(isIOS(info(ANDROID))).toBe(false);
  });

  it("never treats the Android app as iOS", () => {
    expect(isIOS(info(IPHONE_SAFARI, { native: true }))).toBe(false);
  });

  it("tells Safari from other iOS browsers", () => {
    expect(isIOSSafari(info(IPHONE_SAFARI))).toBe(true);
    expect(isIOSSafari(info(IPHONE_CHROME))).toBe(false);
  });

  it("offers the install steps only while not installed", () => {
    expect(shouldOfferIOSInstall(info(IPHONE_SAFARI))).toBe(true);
    expect(shouldOfferIOSInstall(info(IPHONE_SAFARI, { standalone: true }))).toBe(false);
    expect(shouldOfferIOSInstall(info(ANDROID))).toBe(false);
  });

  it("offers the Android app to Android browsers, never inside it or on iOS", () => {
    expect(isAndroidWeb(info(ANDROID))).toBe(true);
    expect(shouldOfferAndroidApp(info(ANDROID))).toBe(true);
    // Installed as a web app (standalone) still gets the offer: the app does more.
    expect(shouldOfferAndroidApp(info(ANDROID, { standalone: true }))).toBe(true);
    expect(shouldOfferAndroidApp(info(ANDROID, { native: true }))).toBe(false);
    expect(shouldOfferAndroidApp(info(IPHONE_SAFARI))).toBe(false);
    expect(shouldOfferAndroidApp(info(MAC, { maxTouchPoints: 0 }))).toBe(false);
  });

  it("names the iOS browser", () => {
    expect(iosBrowser(info(IPHONE_SAFARI))).toBe("safari");
    expect(iosBrowser(info(IPHONE_CHROME))).toBe("chrome");
    expect(iosBrowser(info(IPHONE_SAFARI.replace("Version/18.0", "FxiOS/130.0")))).toBe("firefox");
    expect(iosBrowser(info(IPHONE_SAFARI.replace("Version/18.0", "EdgiOS/129.0")))).toBe("edge");
  });

  describe("in-app browsers", () => {
    const IPHONE_INSTAGRAM = IPHONE_SAFARI.replace("Safari/604.1", "Instagram 330.0.0 (iPhone14,5; iOS 18_0)");
    const IPHONE_REDDIT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Reddit/Version 2025.10.0/Build 1";
    const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
    const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36";
    const ANDROID_FACEBOOK = ANDROID.replace("Safari/537.36", "Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]");

    it("spots apps that name themselves, and bare web views", () => {
      expect(isInAppBrowser(info(IPHONE_INSTAGRAM))).toBe(true);
      expect(isInAppBrowser(info(IPHONE_REDDIT))).toBe(true);
      expect(isInAppBrowser(info(IPHONE_WEBVIEW))).toBe(true);
      expect(isInAppBrowser(info(ANDROID_WEBVIEW))).toBe(true);
      expect(isInAppBrowser(info(ANDROID_FACEBOOK))).toBe(true);
    });

    it("leaves real browsers, the installed app and the Android app alone", () => {
      expect(isInAppBrowser(info(IPHONE_SAFARI))).toBe(false);
      expect(isInAppBrowser(info(IPHONE_CHROME))).toBe(false);
      expect(isInAppBrowser(info(ANDROID))).toBe(false);
      expect(isInAppBrowser(info(MAC, { maxTouchPoints: 0 }))).toBe(false);
      // A Home Screen app has no "Safari/" in its user agent either.
      expect(isInAppBrowser(info(IPHONE_WEBVIEW, { standalone: true }))).toBe(false);
      expect(isInAppBrowser(info(ANDROID_WEBVIEW, { native: true }))).toBe(false);
    });

    it("builds a link that opens the page in Chrome", () => {
      expect(chromeIntentUrl("https://bouldertracker.nathanzumbusch.de/about.html?x=1#install"))
        .toBe("intent://bouldertracker.nathanzumbusch.de/about.html?x=1#Intent;scheme=https;package=com.android.chrome;end");
      expect(chromeIntentUrl("javascript:alert(1)")).toBeNull();
      expect(chromeIntentUrl("nonsense")).toBeNull();
    });
  });
});
