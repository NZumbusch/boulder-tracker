import { describe, it, expect } from "vitest";
// @ts-expect-error plain JS module
import { parseLog, splitTitle } from "./changelog.mjs";

const entry = (hash: string, date: string, subject: string, body = "") => `${hash}\x1f${date}\x1f${subject}\x1f${body}\x1e\n`;

describe("splitTitle", () => {
  it("takes a short title from the subject's first clause", () => {
    expect(splitTitle("Taper view: the weekly load a taper would aim for before a goal")).toEqual({ title: "Taper view", detail: "the weekly load a taper would aim for before a goal" });
    expect(splitTitle("Smaller prompts - a compact version that is the default")).toEqual({ title: "Smaller prompts", detail: "a compact version that is the default" });
  });
  it("keeps a short subject as is, and a long one with no clause cut with the whole of it as detail", () => {
    expect(splitTitle("Fix the timer")).toEqual({ title: "Fix the timer" });
    const long = "A very long subject without any separator in it that just keeps on going and going until it is too long";
    const r = splitTitle(long);
    expect(r.title.endsWith("…")).toBe(true);
    expect(r.detail).toBe(long);
  });
  it("prefers the written Changelog text as the detail", () => {
    expect(splitTitle("Fix: x", "The timer no longer jumps.")).toEqual({ title: "Fix", detail: "The timer no longer jumps." });
  });
});

describe("parseLog", () => {
  it("gives each commit a title (and detail when there is more)", () => {
    expect(parseLog(entry("abc1234", "2026-10-11", "Fix the timer"))).toEqual([{ hash: "abc1234", date: "2026-10-11", title: "Fix the timer" }]);
    expect(parseLog(entry("a", "2026-10-11", "Tests: guided tidy-up"))[0]).toMatchObject({ title: "Tests", detail: "guided tidy-up" });
  });

  it("uses a Changelog line as the detail, which may continue on indented lines", () => {
    const body = "Claude-Session: x\nChangelog: The timer no longer jumps\n  after a pause, and beeps on time.\n\nOther text";
    expect(parseLog(entry("a", "2026-10-11", "Fix", body))[0]).toEqual({ hash: "a", date: "2026-10-11", title: "Fix", detail: "The timer no longer jumps after a pause, and beeps on time." });
  });

  it("leaves out commits marked with Changelog: -", () => {
    expect(parseLog(entry("a", "2026-10-11", "Refactor", "Changelog: -") + entry("b", "2026-10-10", "Keep")).map((e: { hash: string }) => e.hash)).toEqual(["b"]);
  });

  it("keeps the order and copes with nothing", () => {
    expect(parseLog(entry("a", "2026-10-11", "One") + entry("b", "2026-10-10", "Two")).map((e: { hash: string }) => e.hash)).toEqual(["a", "b"]);
    expect(parseLog("")).toEqual([]);
  });
});
