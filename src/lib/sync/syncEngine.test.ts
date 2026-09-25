import { describe, it, expect } from "vitest";
import { runSync, SyncVersionError, docFileName, type SyncTransport, type LocalPort } from "./syncEngine";
import { initLedger, trackTable, type Ledger } from "./merge";

const TABLES = ["workouts", "dailyMetrics"] as const;

/** Drive's app folder: files by id, in memory. */
function fakeDrive() {
  const files = new Map<string, { name: string; content: string }>();
  let next = 1;
  const transport: SyncTransport = {
    async list() {
      return [...files].map(([id, f]) => ({ id, name: f.name }));
    },
    async read(id) {
      return files.get(id)!.content;
    },
    async write(name, content, id) {
      const fileId = id ?? `f${next++}`;
      files.set(fileId, { name, content });
      return { id: fileId, name };
    },
  };
  return { files, transport };
}

/** A device: its tables, ledger and clock, tracked like persistence's flush hook does. */
function device(id: string, tables: Record<string, unknown[]>, exportVersion = "3.29") {
  const state = {
    tables: structuredClone(tables) as Record<string, unknown>,
    ledger: initLedger(tables, TABLES, id) as Ledger,
    gen: 0,
    lastSyncAt: null as number | null,
    exportVersion,
  };
  const local: LocalPort = {
    tables: () => state.tables,
    ledger: () => state.ledger,
    exportVersion: () => state.exportVersion,
    generation: () => state.gen,
    async apply(tables, _changed, ledger) {
      state.tables = tables;
      state.ledger = ledger;
    },
    migrate(db) {
      // Pretend 3.28 -> 3.29 renamed `notes` to `name`.
      for (const w of db.workouts as { notes?: string; name?: string }[]) {
        if (w.notes !== undefined) { w.name = w.notes; delete w.notes; }
      }
      db.exportVersion = "3.29";
    },
  };
  const edit = (now: number, fn: (t: Record<string, unknown[]>) => void) => {
    fn(state.tables as Record<string, unknown[]>);
    for (const t of TABLES) if (trackTable(state.ledger, t, state.tables[t], now, id)) state.gen++;
  };
  const sync = async (drive: SyncTransport, at: number) => {
    const out = await runSync({ transport: drive, local, identity: { deviceId: id, deviceName: id }, lastSyncAt: state.lastSyncAt, tableNames: TABLES, now: () => at });
    state.lastSyncAt = out.syncedAt;
    return out;
  };
  return { state, local, edit, sync };
}

const w = (id: string, name: string) => ({ id, name });

describe("runSync", () => {
  it("phone and tablet end up with the same data, each writing only its own file", async () => {
    const drive = fakeDrive();
    const phone = device("phone", { workouts: [w("a", "hangs")], dailyMetrics: [] });
    const tablet = device("tablet", { workouts: [], dailyMetrics: [] });

    await phone.sync(drive.transport, 100);
    await tablet.sync(drive.transport, 110);
    expect(tablet.state.tables.workouts).toEqual([w("a", "hangs")]);

    tablet.edit(200, (t) => t.dailyMetrics.push({ id: "m1", metricId: "hrv", date: "2026-09-25", value: 60 }));
    phone.edit(210, (t) => t.workouts.push(w("b", "board")));
    const atTablet = await tablet.sync(drive.transport, 300);
    await phone.sync(drive.transport, 310);
    await tablet.sync(drive.transport, 320);

    expect(atTablet.devices.map((d) => d.deviceId)).toEqual(["phone"]);
    expect(phone.state.tables).toEqual(tablet.state.tables);
    expect([...drive.files.values()].map((f) => f.name).sort()).toEqual([docFileName("phone"), docFileName("tablet")]);
  });

  it("reports a conflict once, on the device that resolves it", async () => {
    const drive = fakeDrive();
    const phone = device("phone", { workouts: [w("a", "base")], dailyMetrics: [] });
    const tablet = device("tablet", { workouts: [], dailyMetrics: [] });
    await phone.sync(drive.transport, 100);
    await tablet.sync(drive.transport, 110);

    phone.edit(200, (t) => { t.workouts[0] = w("a", "phone"); });
    tablet.edit(220, (t) => { t.workouts[0] = w("a", "tablet"); });
    await tablet.sync(drive.transport, 300); // the phone hasn't uploaded its edit yet
    const atPhone = await phone.sync(drive.transport, 310);
    const atTablet = await tablet.sync(drive.transport, 320);

    expect(atPhone.conflicts.map((c) => c.lost.device)).toEqual(["phone"]);
    expect(atTablet.conflicts).toEqual([]);
    expect(phone.state.tables.workouts).toEqual([w("a", "tablet")]);
    expect(tablet.state.tables.workouts).toEqual([w("a", "tablet")]);
  });

  it("starts over when the data changes mid-sync, instead of overwriting the edit", async () => {
    const drive = fakeDrive();
    const phone = device("phone", { workouts: [w("a", "x")], dailyMetrics: [] });
    const tablet = device("tablet", { workouts: [], dailyMetrics: [] });
    await phone.sync(drive.transport, 100);

    let reads = 0;
    const racing: SyncTransport = {
      ...drive.transport,
      async read(id) {
        if (reads++ === 0) tablet.edit(150, (t) => t.dailyMetrics.push({ id: "m", value: 1 }));
        return drive.transport.read(id);
      },
    };
    await tablet.sync(racing, 200);
    expect(tablet.state.tables.dailyMetrics).toEqual([{ id: "m", value: 1 }]);
    expect(tablet.state.tables.workouts).toEqual([w("a", "x")]);
  });

  it("migrates a doc from an older app version, and refuses one from a newer", async () => {
    const drive = fakeDrive();
    const old = device("old", { workouts: [{ id: "a", notes: "legacy" }], dailyMetrics: [] }, "3.28");
    await old.sync(drive.transport, 100);
    const fresh = device("fresh", { workouts: [], dailyMetrics: [] });
    await fresh.sync(drive.transport, 110);
    expect(fresh.state.tables.workouts).toEqual([{ id: "a", name: "legacy" }]);

    const behind = device("behind", { workouts: [], dailyMetrics: [] }, "3.20");
    await expect(behind.sync(drive.transport, 120)).rejects.toBeInstanceOf(SyncVersionError);
  });
});
