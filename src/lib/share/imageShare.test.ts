import { describe, it, expect } from "vitest";
import { shareImageFileName, dataUrlToBase64, isDismissal } from "./imageShare";

describe("shareImageFileName", () => {
  it("names the file after the session's day", () => {
    expect(shareImageFileName("2026-09-22T18:30:00.000Z")).toBe("boulder-session-2026-09-22.png");
  });

  it("accepts a bare date", () => {
    expect(shareImageFileName("2026-09-22")).toBe("boulder-session-2026-09-22.png");
  });

  it("falls back to today for a planned session with no date", () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // the file name uses the local day
    expect(shareImageFileName(null)).toBe(`boulder-session-${today}.png`);
    expect(shareImageFileName(undefined)).toBe(`boulder-session-${today}.png`);
    expect(shareImageFileName("")).toBe(`boulder-session-${today}.png`);
  });

  it("falls back to today rather than producing an Invalid Date name", () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; // the file name uses the local day
    expect(shareImageFileName("not a date")).toBe(`boulder-session-${today}.png`);
  });

  it("always produces a .png with no path separators in it", () => {
    for (const input of ["2026-09-22T18:30:00.000Z", null, "garbage"]) {
      const name = shareImageFileName(input);
      expect(name.endsWith(".png")).toBe(true);
      expect(name).not.toMatch(/[/\\]/);
    }
  });
});

describe("dataUrlToBase64", () => {
  it("strips the data URL prefix", () => {
    expect(dataUrlToBase64("data:image/png;base64,iVBORw0KGgo=")).toBe("iVBORw0KGgo=");
  });

  it("handles a prefix with no media type", () => {
    expect(dataUrlToBase64("data:,abc")).toBe("abc");
  });

  it("keeps base64 padding and any commas in the payload", () => {
    expect(dataUrlToBase64("data:image/png;base64,AAA,BBB==")).toBe("AAA,BBB==");
  });

  it("returns empty for an empty payload rather than throwing", () => {
    expect(dataUrlToBase64("data:image/png;base64,")).toBe("");
  });

  it("rejects anything that is not a data URL", () => {
    // Writing a whole data URL into Filesystem produces a corrupt PNG that
    // only fails much later, when something tries to open it - so this
    // fails loudly at the boundary instead.
    expect(() => dataUrlToBase64("https://example.com/a.png")).toThrow();
    expect(() => dataUrlToBase64("iVBORw0KGgo=")).toThrow();
    expect(() => dataUrlToBase64("")).toThrow();
    expect(() => dataUrlToBase64("data:image/png;base64")).toThrow();
  });
});

describe("isDismissal", () => {
  it("recognises the user closing a share sheet", () => {
    const abort = new Error("The operation was aborted.");
    abort.name = "AbortError";
    expect(isDismissal(abort)).toBe(true);
  });

  it("recognises cancel/dismiss wording from native plugins", () => {
    expect(isDismissal(new Error("Share canceled"))).toBe(true);
    expect(isDismissal(new Error("User dismissed the dialog"))).toBe(true);
  });

  it("does not mistake a real failure for a dismissal", () => {
    expect(isDismissal(new Error("Permission denied"))).toBe(false);
    expect(isDismissal(new Error("ENOENT: no such file"))).toBe(false);
  });

  it("never throws on odd input", () => {
    for (const input of [null, undefined, "string", 42, {}]) {
      expect(() => isDismissal(input)).not.toThrow();
      expect(isDismissal(input)).toBe(false);
    }
  });
});
