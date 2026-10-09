import { describe, expect, it } from "vitest";
import { formatPerSet, hasPerSet, perSetKeysFor, setCount, setRows, setValue, withSetRows } from "./setRows";

describe("setRows", () => {
  it("lays plain values out across the sets", () => {
    expect(setRows({ sets: 3, reps: 5, weight: 10 })).toEqual([{ reps: 5, weight: 10 }, { reps: 5, weight: 10 }, { reps: 5, weight: 10 }]);
  });

  it("reads the old per-set reps array and the new per-set details together", () => {
    const rows = setRows({ reps: [6, 5, 4], weight: 12.5, setDetails: [{ weight: 10 }, { weight: 12.5 }, { weight: 15 }] });
    expect(rows.map((r) => [r.reps, r.weight])).toEqual([[6, 10], [5, 12.5], [4, 15]]);
  });

  it("counts the sets from the longest list", () => {
    expect(setCount({ sets: 2, reps: [5, 5, 5] })).toBe(3);
    expect(setCount({})).toBe(1);
  });
});

describe("withSetRows", () => {
  it("writes uniform rows as plain fields and nothing else", () => {
    const v = withSetRows({}, [{ reps: 5, weight: 10 }, { reps: 5, weight: 10 }]);
    expect(v).toEqual({ sets: 2, reps: 5, weight: 10 });
    expect(hasPerSet(v)).toBe(false);
  });

  it("keeps a differing field per set and the mean beside it", () => {
    const v = withSetRows({}, [{ reps: 6, weight: 10 }, { reps: 5, weight: 12.5 }, { reps: 4, weight: 15 }]);
    expect(v.reps).toEqual([6, 5, 4]);
    expect(v.weight).toBe(12.5);
    expect(v.setDetails).toEqual([{ weight: 10 }, { weight: 12.5 }, { weight: 15 }]);
    expect(v.sets).toBe(3);
  });

  it("only puts the keys that vary into the details", () => {
    const v = withSetRows({}, [{ reps: 5, weight: 10 }, { reps: 5, weight: 20 }]);
    expect(v.setDetails).toEqual([{ weight: 10 }, { weight: 20 }]);
    expect(v.reps).toBe(5);
  });

  it("round-trips through setRows", () => {
    const rows = [{ reps: 6, weight: 10, boardAngle: 40 }, { reps: 5, weight: 12.5, boardAngle: 45 }];
    expect(setRows(withSetRows({}, rows))).toEqual(rows);
  });

  it("leaves other fields alone and drops stale details", () => {
    const v = withSetRows({ notes: "n", holdSize: 20, setDetails: [{ weight: 1 }, { weight: 2 }] }, [{ weight: 5 }, { weight: 5 }], ["weight"]);
    expect(v).toEqual({ notes: "n", holdSize: 20, sets: 2, weight: 5 });
  });
});

describe("helpers", () => {
  it("reads one field of one set", () => {
    expect(setValue({ weight: 10, setDetails: [{ weight: 8 }, { weight: 12 }] }, 1, "weight")).toBe(12);
  });

  it("formats a field per set or as one number", () => {
    expect(formatPerSet({ setDetails: [{ weight: 10 }, { weight: 12.5 }], weight: 11 }, "weight")).toBe("10 / 12.5");
    expect(formatPerSet({ weight: 10, sets: 3 }, "weight")).toBe("10");
    expect(formatPerSet({}, "weight")).toBeUndefined();
  });

  it("offers per set what the type allows and the exercise tracks", () => {
    expect(perSetKeysFor(["sets", "reps", "weight"])).toEqual(["reps", "weight"]);
    expect(perSetKeysFor(["sets", "reps", "weight"], ["weight"])).toEqual(["weight"]);
    expect(perSetKeysFor(["boardAngle", "duration"], undefined)).toEqual(["boardAngle"]);
  });
});
