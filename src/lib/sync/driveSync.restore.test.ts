import { beforeEach, describe, expect, it, vi } from "vitest";

// The Android plugin, Capacitor, storage and the app state are stubbed: what is under test is the
// start-up decision about a restored backup (identity.ts) as the sync class applies it.
const marker = { value: "install-NEW" as string | null };
vi.mock("../native/driveClient", () => {
  class DriveClient {
    email: string | undefined;
    static installMarker = async () => marker.value;
    static deviceName = async () => "Pixel 8";
    authorize = async () => ({ email: "a@example.com" });
    list = async () => [];
    read = async () => "";
    write = async () => ({ id: "f", name: "x" });
    about = async () => ({});
    revoke = async () => {};
  }
  return { DriveClient, driveSyncAvailable: () => true, driveErrorCode: () => undefined };
});
vi.mock("localforage", () => {
  const store = new Map<string, unknown>();
  return { default: { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: unknown) => void store.set(k, v), removeItem: async (k: string) => void store.delete(k) } };
});
vi.mock("../state.svelte", () => ({ trainingState: { refresh: async () => {} } }));
vi.mock("../toast.svelte", () => ({ toast: { show: vi.fn() } }));
vi.mock("../storage/migrations", () => ({ runDataMigrations: () => ({}) }));
vi.mock("../storage/autoBackup", () => ({ writeAutoBackup: async () => "" }));
vi.mock("../storage/persistence", () => ({
  _dbState: { exportVersion: "2.1", workouts: [], templates: {} },
  TABLES: ["workouts"],
  initDB: async () => {},
  flushDB: async () => {},
  isDemoMode: () => false,
  setFlushListener: () => {},
}));

const SETTINGS_KEY = "boulder_tracker_sync";
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
vi.stubGlobal("document", { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: "visible" });

const connected = (over: Record<string, unknown> = {}) => ({
  connected: true, deviceId: "dev-OLD", deviceName: "Pixel 8", deviceModel: "Pixel 8", account: "a@example.com", lastSyncAt: 5000, devices: [{ deviceId: "other", deviceName: "Tablet", writtenAt: 1 }], ...over,
});

async function freshSync() {
  vi.resetModules();
  const mod = await import("./driveSync.svelte");
  return mod.driveSync;
}

beforeEach(() => {
  storage.clear();
  marker.value = "install-NEW";
});

describe("sync start-up after a possible restore", () => {
  it("gives a restored copy its own identity, starts its history again and says so", async () => {
    storage.set(SETTINGS_KEY, JSON.stringify(connected({ installMarker: "install-OLD" })));
    const sync = await freshSync();
    await sync.init();
    const saved = JSON.parse(storage.get(SETTINGS_KEY)!);
    expect(saved.deviceId).not.toBe("dev-OLD");
    expect(saved.installMarker).toBe("install-NEW");
    expect(saved.lastSyncAt).toBeNull();
    expect(saved.devices).toEqual([]);
    expect(saved.account).toBe("a@example.com");
    expect(sync.notice).toMatch(/restored from a backup/);
    const { toast } = await import("../toast.svelte");
    expect(toast.show).toHaveBeenCalled();
  });

  it("leaves the same install alone", async () => {
    storage.set(SETTINGS_KEY, JSON.stringify(connected({ installMarker: "install-NEW" })));
    const sync = await freshSync();
    await sync.init();
    const saved = JSON.parse(storage.get(SETTINGS_KEY)!);
    expect(saved.deviceId).toBe("dev-OLD");
    expect(saved.lastSyncAt).toBe(5000);
    expect(sync.notice).toBeUndefined();
  });

  it("records the marker for settings from before markers, without changing the identity", async () => {
    storage.set(SETTINGS_KEY, JSON.stringify(connected()));
    const sync = await freshSync();
    await sync.init();
    const saved = JSON.parse(storage.get(SETTINGS_KEY)!);
    expect(saved.deviceId).toBe("dev-OLD");
    expect(saved.installMarker).toBe("install-NEW");
    expect(sync.notice).toBeUndefined();
  });

  it("does nothing when the plugin can't give a marker", async () => {
    marker.value = null;
    storage.set(SETTINGS_KEY, JSON.stringify(connected({ installMarker: "install-OLD" })));
    const sync = await freshSync();
    await sync.init();
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).deviceId).toBe("dev-OLD");
    expect(sync.notice).toBeUndefined();
  });

  it("a reconnect on a restored copy doesn't reuse the other install's device id", async () => {
    storage.set(SETTINGS_KEY, JSON.stringify({ connected: false, deviceId: "dev-OLD", installMarker: "install-OLD" }));
    const sync = await freshSync();
    await sync.connect();
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).deviceId).not.toBe("dev-OLD");
  });

  it("a reconnect on the same install keeps its device id", async () => {
    storage.set(SETTINGS_KEY, JSON.stringify({ connected: false, deviceId: "dev-OLD", installMarker: "install-NEW" }));
    const sync = await freshSync();
    await sync.connect();
    expect(JSON.parse(storage.get(SETTINGS_KEY)!).deviceId).toBe("dev-OLD");
  });
});
