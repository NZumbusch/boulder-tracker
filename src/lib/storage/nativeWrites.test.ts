import { describe, it, expect, vi } from "vitest";

// On Android the whole database is one JSON file. Pending writes are
// resolved by hand here, to control exactly when each one finishes.
const { writes } = vi.hoisted(() => ({ writes: [] as { data: string; done: () => void }[] }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    readFile: vi.fn(async () => { throw new Error("no file yet"); }),
    writeFile: vi.fn(({ data }: { data: string }) => new Promise<void>((done) => writes.push({ data, done }))),
  },
}));
vi.mock("localforage", () => ({ default: { config: vi.fn(), getItem: vi.fn(async () => null), setItem: vi.fn() } }));

import { flushDB, setDbState, _dbState } from "./persistence";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("native writes", () => {
  it("never overlap, and saves made during a write share one follow-up write of the latest data", async () => {
    setDbState({ workouts: [], n: 0 });
    const first = flushDB();
    await tick();
    expect(writes).toHaveLength(1);

    // Three more saves while the first write is still going.
    const later = [1, 2, 3].map((n) => { _dbState.n = n; return flushDB(); });
    await tick();
    expect(writes).toHaveLength(1); // nothing overlaps the running write

    writes[0].done();
    await first;
    await tick();
    expect(writes).toHaveLength(2); // one follow-up for all three
    expect(JSON.parse(writes[1].data).n).toBe(3);

    writes[1].done();
    await Promise.all(later); // every caller resolves once its data is on disk
    expect(writes).toHaveLength(2);
  });
});
