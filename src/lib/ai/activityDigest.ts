import type { ExternalActivity } from "../types";
import type { AIFields } from "../preferences/migrate";
import { formatPaceOrSpeed } from "../activity/format";
import { zoneMinutes } from "../activity/stats";

/**
 * An imported activity as a few words for the AI: how fast it was, how the
 * kilometres went, how hard it was on the heart, what Garmin made of it. The
 * numbers come from `ActivityStats` (worked out when the recording was
 * imported); each group is a switch (`AIFields`), so what it costs is chosen.
 * Strings, not arrays: a model reads "5:12 5:05 5:00" as well as a list and it
 * takes a third of the tokens. Pure.
 */

const MAX_SPLITS_SHOWN = 30;

export type DigestFields = Pick<AIFields, "pace" | "zones" | "effect" | "terrain">;

/** 312 -> "5:12". */
export function mmss(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Garmin's feel scale, 0 very weak .. 100 very strong, as a word. */
function feelWord(feel: number): string {
  return feel < 13 ? "very weak" : feel < 38 ? "weak" : feel < 63 ? "normal" : feel < 88 ? "strong" : "very strong";
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v)}`;

/** What to add to an activity's line, per switched-on group; an empty object when there is nothing. */
export function activityDigest(a: ExternalActivity, fields: DigestFields, maxHr: number): Record<string, string> {
  const out: Record<string, string> = {};
  const st = a.stats;

  if (fields.pace) {
    const pace = formatPaceOrSpeed(a);
    if (pace) out.pace = pace.replace(" /km", "/km");
    if (st?.splitsSec?.length) {
      const shown = st.splitsSec.slice(0, MAX_SPLITS_SHOWN).map(mmss).join(" ");
      out.kmSplits = st.splitsSec.length > MAX_SPLITS_SHOWN ? `${shown} ...` : shown;
    }
    if (st?.laps?.length) out.laps = st.laps.map((l) => [mmss(l.sec), l.m ? `${l.m} m` : "", l.hr ? `${l.hr} bpm` : ""].filter(Boolean).join(" ")).join(" | ");
    const drift = [
      st?.paceDriftPct !== undefined && Math.abs(st.paceDriftPct) >= 2 ? `second half ${Math.abs(st.paceDriftPct)} % ${st.paceDriftPct > 0 ? "slower" : "faster"}` : "",
      st?.hrDriftBpm !== undefined && Math.abs(st.hrDriftBpm) >= 3 ? `heart rate ${signed(st.hrDriftBpm)} bpm` : "",
    ].filter(Boolean);
    if (drift.length) out.drift = drift.join(", ");
  }

  if (fields.zones) {
    const zones = zoneMinutes(st, maxHr);
    const text = zones?.map((m, i) => (m > 0 ? `Z${i + 1} ${m}` : "")).filter(Boolean).join(" · ");
    if (text) out.zonesMin = text;
  }

  if (fields.effect && st) {
    const effect = [
      st.effectLabel ? `trained: ${st.effectLabel}` : "",
      st.trainingEffect ? `effect ${st.trainingEffect}` : "",
      st.anaerobicEffect ? `anaerobic ${st.anaerobicEffect}` : "",
      st.rpe ? `my rating ${st.rpe}/10` : "",
      st.feel !== undefined ? `felt ${feelWord(st.feel)}` : "",
      st.bodyBatteryDelta ? `Body Battery ${signed(st.bodyBatteryDelta)}` : "",
    ].filter(Boolean);
    if (effect.length) out.garminEffect = effect.join(", ");
  }

  if (fields.terrain) {
    const terrain = [
      a.elevationM ? `ascent ${Math.round(a.elevationM)} m` : "",
      st?.descentM ? `descent ${st.descentM} m` : "",
      st?.avgCadence ? `cadence ${st.avgCadence}` : "",
      st?.strideCm ? `stride ${st.strideCm} cm` : "",
      st?.avgPowerW ? `power ${st.avgPowerW} W` : "",
      st?.avgTempC !== undefined ? `${st.avgTempC} °C` : "",
    ].filter(Boolean);
    if (terrain.length) out.terrain = terrain.join(", ");
  }
  return out;
}

/** What the digest keys mean, for the model: only the ones that appear. */
export function digestLegend(present: Set<string>): string {
  const parts: string[] = [];
  if (present.has("pace")) parts.push("pace is per km for runs, walks and hikes, km/h otherwise");
  if (present.has("kmSplits")) parts.push("kmSplits are minutes:seconds for each full km");
  if (present.has("laps")) parts.push("laps are a workout's own intervals (time, distance, heart rate)");
  if (present.has("drift")) parts.push("drift compares the second half with the first");
  if (present.has("zonesMin")) parts.push("zonesMin are minutes in heart-rate zones Z1-Z5 (% of my highest heart rate)");
  if (present.has("garminEffect")) parts.push("garminEffect is what Garmin says the activity trained, how I rated and felt it, and the Body Battery it cost");
  return parts.length ? ` ${parts.join("; ")}.` : "";
}
