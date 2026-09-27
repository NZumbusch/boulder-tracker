import { describe, it, expect } from "vitest";
import { parseManifest, isNewer, changesSince, apkUrl, formatSize, manifestUrlFor, UPDATE_MANIFEST_URL } from "./appUpdate";

const SHA = "a".repeat(64);
const raw = {
  versionCode: 214,
  versionName: "1.0.214",
  apk: "boulder-tracker.apk",
  sha256: SHA.toUpperCase(),
  size: 12_900_000,
  changes: [
    { versionCode: 214, subject: "Plan B for uncertain days" },
    { versionCode: 213, subject: "Health Connect sleep" },
    { versionCode: 210, subject: "Older" },
  ],
};

describe("parseManifest", () => {
  it("reads a version file", () => {
    const m = parseManifest(raw)!;
    expect(m.versionCode).toBe(214);
    expect(m.sha256).toBe(SHA);
    expect(m.changes).toHaveLength(3);
  });

  it("rejects anything that isn't one", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ ...raw, versionCode: "214" })).toBeNull();
    expect(parseManifest({ ...raw, sha256: "abc" })).toBeNull();
    expect(parseManifest({ ...raw, apk: "" })).toBeNull();
    expect(parseManifest({ ...raw, changes: "nope" })!.changes).toEqual([]);
  });
});

describe("channels", () => {
  it("testing keeps the original address; stable has its own folder", () => {
    expect(manifestUrlFor("testing")).toBe(UPDATE_MANIFEST_URL);
    expect(manifestUrlFor("stable")).toMatch(/\/android\/stable\/version\.json$/);
    const m = parseManifest(raw)!;
    expect(apkUrl(m, manifestUrlFor("stable"))).toMatch(/\/android\/stable\/boulder-tracker\.apk$/);
  });
});

describe("deciding", () => {
  const m = parseManifest(raw)!;
  it("offers only a higher build number", () => {
    expect(isNewer(m, 213)).toBe(true);
    expect(isNewer(m, 214)).toBe(false);
    expect(isNewer(m, 300)).toBe(false);
  });

  it("lists what's new since the installed build", () => {
    expect(changesSince(m, 212)).toEqual(["Plan B for uncertain days", "Health Connect sleep"]);
    expect(changesSince(m, 1, 1)).toEqual(["Plan B for uncertain days"]);
  });

  it("resolves the APK next to the version file, https only", () => {
    expect(UPDATE_MANIFEST_URL).toMatch(/^https:\/\/.+\/android\/version\.json$/);
    expect(apkUrl(m, UPDATE_MANIFEST_URL)).toBe(UPDATE_MANIFEST_URL.replace("version.json", "boulder-tracker.apk"));
    expect(apkUrl({ ...m, apk: "http://evil.example/x.apk" }, UPDATE_MANIFEST_URL)).toBeNull();
    expect(formatSize(m.size)).toBe("12.3 MB");
  });
});
