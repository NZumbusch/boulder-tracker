import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/*
 * The type ramp has a floor of 11 px (`text-caption`, and `text-micro` for chart axes, badges and nav labels - both follow
 * the Text size setting). Arbitrary sizes under it (`text-[9px]`, `text-[10px]`) ignore that setting and are too small to read.
 *
 * This lists the files that still have them, so a new one cannot appear unnoticed. The list only ever shrinks: when you
 * change a file to `text-micro` or `text-caption`, remove it here (the second test fails if you forget).
 */
const SRC = resolve(__dirname, "../..");
const SMALL = /text-\[(?:[0-9]|10)px\]/;

/** Files not yet moved to the ramp. Remove an entry when its file is clean. */
const ALLOWED = new Set([
  "components/analytics/BlockReviewSheet.svelte",
  "components/analytics/HeatmapPanel.svelte",
  "components/analytics/LoadPanel.svelte",
  "components/analytics/PhaseBand.svelte",
  "components/dashboard/home/ThisWeekCard.svelte",
  "components/health/PainHeadsUp.svelte",
  "components/history/History.svelte",
  // Rendered to an image at a fixed size (not the app's text scale): the share cards.
  "components/history/WorkoutShareImage.svelte",
  "components/plan/WeekShareImage.svelte",
  "components/plan/CalendarMonth.svelte",
  "components/plan/PhaseStrip.svelte",
  "components/plan/TrainingPlan.svelte",
  "components/plan/WeekCalendar.svelte",
  "components/sends/GradeChart.svelte",
  "components/settings/ErrorLogCard.svelte",
  "components/workout/TargetHint.svelte",
]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(svelte|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

const using = files(SRC)
  .filter((f) => SMALL.test(readFileSync(f, "utf8")))
  .map((f) => relative(SRC, f).replaceAll("\\", "/"))
  .sort();

describe("type floor", () => {
  it("has no new text under 11 px", () => {
    expect(using.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
  it("lists only files that still have it (shrink the allowlist)", () => {
    expect([...ALLOWED].filter((f) => !using.includes(f)).sort()).toEqual([]);
  });
});
