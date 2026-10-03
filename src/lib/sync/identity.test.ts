import { describe, expect, it } from "vitest";
import { installVerdict, restoredSettings, RESTORED_NOTICE } from "./identity";

describe("installVerdict", () => {
  it("is the same install when the marker matches", () => {
    expect(installVerdict("abc", "abc")).toBe("same");
  });

  it("is a restored copy when the marker differs: the settings came from a backup of another install", () => {
    expect(installVerdict("abc", "xyz")).toBe("restored");
  });

  it("adopts the marker when none was recorded yet (settings from before markers, or a first connect)", () => {
    expect(installVerdict(undefined, "xyz")).toBe("adopt");
    expect(installVerdict("", "xyz")).toBe("adopt");
  });

  it("leaves things alone when the marker can't be read", () => {
    expect(installVerdict("abc", null)).toBe("unknown");
    expect(installVerdict(undefined, null)).toBe("unknown");
  });
});

describe("restoredSettings", () => {
  const cloned = {
    connected: true, deviceId: "old1", deviceName: "Ada's Phone (Pixel 8)", deviceModel: "Pixel 8", deviceLabel: "Ada's Phone",
    account: "a@example.com", accountName: "Ada", lastSyncAt: 1234, devices: [{ deviceId: "old2", deviceName: "Tablet", writtenAt: 1 }], installMarker: "abc",
  };

  it("gives the copy its own identity and makes its first sync adopt what is on Drive", () => {
    const s = restoredSettings(cloned, "new9", "xyz");
    expect(s.deviceId).toBe("new9");
    expect(s.installMarker).toBe("xyz");
    expect(s.lastSyncAt).toBeNull();
    expect(s.devices).toEqual([]);
    expect(s.notice).toBe(RESTORED_NOTICE);
  });

  it("keeps the account, the device's name and the connection", () => {
    const s = restoredSettings(cloned, "new9", "xyz");
    expect(s).toMatchObject({ connected: true, account: "a@example.com", accountName: "Ada", deviceLabel: "Ada's Phone", deviceModel: "Pixel 8" });
  });

  it("doesn't change the settings it was given", () => {
    restoredSettings(cloned, "new9", "xyz");
    expect(cloned.deviceId).toBe("old1");
  });
});
