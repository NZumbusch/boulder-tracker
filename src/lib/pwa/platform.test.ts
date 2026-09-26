import { describe, expect, it } from "vitest";
import { isIOS, isIOSSafari, shouldOfferIOSInstall, type BrowserInfo } from "./platform";

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
});
