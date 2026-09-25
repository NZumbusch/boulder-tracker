import { describe, it, expect } from "vitest";
import {
  buildDoc, compareVersions, hashOf, initLedger, mapToTable, mergeDoc, stableStringify, tableToMap, trackTable,
  type Ledger,
} from "./merge";

const TABLES = ["workouts", "weekNotes", "templates"] as const;
type Db = Record<string, unknown>;

/** One device: its tables and ledger, tracked the way flushDB tracks them. */
function device(id: string, tables: Db, ledger?: Ledger) {
  const dev = { id, tables: structuredClone(tables), ledger: ledger ?? initLedger(tables, TABLES, id), lastSyncAt: 0, synced: false };
  return dev;
}
type Device = ReturnType<typeof device>;

function edit(dev: Device, now: number, fn: (db: Db) => void) {
  fn(dev.tables);
  for (const t of TABLES) trackTable(dev.ledger, t, dev.tables[t], now, dev.id);
}
function docOf(dev: Device, now: number) {
  return buildDoc(dev.tables, dev.ledger, TABLES, { deviceId: dev.id, deviceName: dev.id, writtenAt: now, exportVersion: "3.29" });
}
/** `dev` pulls `other`'s doc (as uploaded at `now`). */
function pull(dev: Device, other: Device, now: number) {
  const result = mergeDoc(dev.tables, dev.ledger, structuredClone(docOf(other, now)), TABLES, { lastSyncAt: dev.lastSyncAt, firstSync: !dev.synced, now });
  dev.lastSyncAt = now;
  dev.synced = true;
  return result;
}

const w = (id: string, notes: string) => ({ id, status: "planned", date: null, notes, exercises: [] });

describe("hashing", () => {
  it("ignores key order and undefined keys", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });
});

describe("tables as records", () => {
  it("keys arrays by id (weekId for week tables) and the templates object by phase", () => {
    expect([...tableToMap("workouts", [w("a", "x"), w("b", "y")]).keys()]).toEqual(["a", "b"]);
    expect([...tableToMap("weekNotes", [{ weekId: "2026-W10", text: "" }]).keys()]).toEqual(["2026-W10"]);
    expect([...tableToMap("templates", { p1: [], p2: [] }).keys()]).toEqual(["p1", "p2"]);
  });

  it("keeps the previous order and appends new records", () => {
    const map = new Map<string, unknown>([["c", w("c", "")], ["a", w("a", "new")], ["b", w("b", "")]]);
    const out = mapToTable("workouts", map, [w("a", ""), w("b", "")]) as { id: string }[];
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("tracking", () => {
  it("stamps new, changed and deleted records, and nothing else", () => {
    const ledger: Ledger = {};
    expect(trackTable(ledger, "workouts", [w("a", "x"), w("b", "y")], 10, "phone")).toBe(true);
    expect(trackTable(ledger, "workouts", [w("a", "x"), w("b", "y")], 20, "phone")).toBe(false);
    expect(ledger.workouts.a.t).toBe(10);
    trackTable(ledger, "workouts", [w("a", "edited")], 30, "phone");
    expect(ledger.workouts.a.t).toBe(30);
    expect(ledger.workouts.b).toEqual({ h: "", t: 30, o: "phone", del: true });
  });
});

describe("merging two devices", () => {
  it("a fresh device joining adopts the existing data", () => {
    const phone = device("phone", { workouts: [w("a", "phone's edit")], weekNotes: [], templates: { p: [1] } });
    const tablet = device("tablet", { workouts: [w("a", "default")], weekNotes: [], templates: { p: [0] } });
    // The phone connected first, to an empty Drive: its first sync just uploaded.
    phone.synced = true;
    phone.lastSyncAt = 100;
    const { conflicts } = pull(tablet, phone, 110);
    expect(conflicts).toEqual([]);
    expect(tablet.tables).toEqual(phone.tables);
    // Later, the phone reading the tablet's doc keeps what it has - no swapping back.
    pull(phone, tablet, 120);
    expect((phone.tables.workouts as { notes: string }[])[0].notes).toBe("phone's edit");
  });

  it("carries edits, additions and deletions both ways", () => {
    const phone = device("phone", { workouts: [w("a", "1"), w("b", "2")], weekNotes: [], templates: {} });
    const tablet = device("tablet", {});
    pull(tablet, phone, 100);
    pull(phone, tablet, 101);

    edit(phone, 200, (db) => { (db.workouts as ReturnType<typeof w>[]).push(w("c", "new on phone")); });
    edit(tablet, 210, (db) => { db.workouts = (db.workouts as ReturnType<typeof w>[]).filter((x) => x.id !== "a"); });
    edit(tablet, 220, (db) => { db.weekNotes = [{ weekId: "W1", text: "travel" }]; });

    const toTablet = pull(tablet, phone, 300);
    const toPhone = pull(phone, tablet, 301);
    expect(toTablet.conflicts).toEqual([]);
    expect(toPhone.conflicts).toEqual([]);
    const ids = (d: Device) => (d.tables.workouts as { id: string }[]).map((x) => x.id).sort();
    expect(ids(phone)).toEqual(["b", "c"]);
    expect(ids(tablet)).toEqual(["b", "c"]);
    expect(phone.tables.weekNotes).toEqual([{ weekId: "W1", text: "travel" }]);
  });

  it("the same record edited on both: newer wins, the other is reported, both devices agree", () => {
    const phone = device("phone", { workouts: [w("a", "base")], weekNotes: [], templates: {} });
    const tablet = device("tablet", {});
    pull(tablet, phone, 100);
    pull(phone, tablet, 101);

    edit(phone, 200, (db) => { (db.workouts as ReturnType<typeof w>[])[0].notes = "phone"; });
    edit(tablet, 250, (db) => { (db.workouts as ReturnType<typeof w>[])[0].notes = "tablet"; });

    const atPhone = pull(phone, tablet, 300);
    expect(atPhone.conflicts).toHaveLength(1);
    expect(atPhone.conflicts[0]).toMatchObject({
      table: "workouts", key: "a", kept: { device: "tablet", t: 250 }, lost: { device: "phone", t: 200, deleted: false },
    });
    expect((atPhone.conflicts[0].lost.value as { notes: string }).notes).toBe("phone");

    const atTablet = pull(tablet, phone, 301);
    expect(atTablet.conflicts).toEqual([]); // the phone already took the tablet's version
    expect((tablet.tables.workouts as { notes: string }[])[0].notes).toBe("tablet");
    expect((phone.tables.workouts as { notes: string }[])[0].notes).toBe("tablet");
  });

  it("an edit after a delete brings the record back; a delete after an edit deletes it", () => {
    const phone = device("phone", { workouts: [w("a", "base"), w("b", "base")], weekNotes: [], templates: {} });
    const tablet = device("tablet", {});
    pull(tablet, phone, 100);
    pull(phone, tablet, 101);

    edit(phone, 200, (db) => { db.workouts = (db.workouts as ReturnType<typeof w>[]).filter((x) => x.id !== "a"); });
    edit(tablet, 250, (db) => { (db.workouts as ReturnType<typeof w>[])[0].notes = "still here"; });
    edit(tablet, 260, (db) => { (db.workouts as ReturnType<typeof w>[])[1].notes = "edited"; });
    edit(phone, 270, (db) => { db.workouts = (db.workouts as ReturnType<typeof w>[]).filter((x) => x.id !== "b"); });

    const atPhone = pull(phone, tablet, 300);
    pull(tablet, phone, 301);
    const ids = (d: Device) => (d.tables.workouts as { id: string }[]).map((x) => x.id);
    expect(ids(phone)).toEqual(["a"]);
    expect(ids(tablet)).toEqual(["a"]);
    const byKey = Object.fromEntries(atPhone.conflicts.map((c) => [c.key, c]));
    expect(byKey.a.lost).toMatchObject({ device: "phone", deleted: true });
    expect(byKey.b.lost).toMatchObject({ device: "tablet", deleted: false });
  });

  it("merging the same doc twice changes nothing the second time", () => {
    const phone = device("phone", { workouts: [w("a", "1")], weekNotes: [], templates: {} });
    const tablet = device("tablet", {});
    pull(tablet, phone, 100);
    const again = pull(tablet, phone, 101);
    expect(again).toEqual({ changedTables: [], conflicts: [] });
  });
});

describe("compareVersions", () => {
  it("compares numerically per part", () => {
    expect(compareVersions("3.29", "3.4")).toBeGreaterThan(0);
    expect(compareVersions("3.29", "3.29")).toBe(0);
    expect(compareVersions("2.9", "3.0")).toBeLessThan(0);
  });
});
