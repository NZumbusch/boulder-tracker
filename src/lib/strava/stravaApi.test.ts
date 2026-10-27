import { describe, expect, it } from "vitest";
import { encodeTrack } from "../activity/track";
import { STRAVA_CALLBACK_DOMAIN, STRAVA_REDIRECT_URI, activityFromStrava, authorizeUrl, hasActivityScope, parseStravaCallback } from "./stravaApi";

describe("authorizeUrl", () => {
  it("asks for the activity scope and comes back to the app's own callback page", () => {
    const u = new URL(authorizeUrl(" 12345 ", "nonce"));
    expect(u.searchParams.get("client_id")).toBe("12345");
    expect(u.searchParams.get("redirect_uri")).toBe(STRAVA_REDIRECT_URI);
    expect(u.searchParams.get("scope")).toBe("read,activity:read_all");
    expect(u.searchParams.get("state")).toBe("nonce");
    expect(STRAVA_REDIRECT_URI.startsWith(`https://${STRAVA_CALLBACK_DOMAIN}/`)).toBe(true);
  });
});

describe("parseStravaCallback", () => {
  it("reads the code, state and scope", () => {
    expect(parseStravaCallback("bouldertracker://strava?state=n&code=abc&scope=read,activity:read_all")).toEqual({ state: "n", code: "abc", scope: "read,activity:read_all" });
  });
  it("reads a refusal", () => {
    expect(parseStravaCallback("bouldertracker://strava/?error=access_denied&state=n")).toEqual({ error: "access_denied", state: "n" });
  });
  it("ignores other links", () => {
    expect(parseStravaCallback("bouldertracker://view/plan")).toBeNull();
    expect(parseStravaCallback(undefined)).toBeNull();
  });
  it("knows whether the activity scope was allowed", () => {
    expect(hasActivityScope("read,activity:read_all")).toBe(true);
    expect(hasActivityScope("read")).toBe(false);
    expect(hasActivityScope(undefined)).toBe(false);
  });
});

describe("activityFromStrava", () => {
  const line = encodeTrack([[47.0, 8.0], [47.001, 8.001], [47.002, 8.003]]);
  it("maps a run like the archive import would (same id, type and units)", () => {
    const a = activityFromStrava({
      id: 987, name: "Lunch Run", type: "Run", sport_type: "TrailRun", start_date: "2026-10-20T10:30:00Z",
      distance: 5012.4, moving_time: 1500, elapsed_time: 1560, total_elevation_gain: 40.2, average_heartrate: 151.4, max_heartrate: 178, calories: 410,
      map: { summary_polyline: line },
    })!;
    expect(a).toMatchObject({ id: "strava-987", source: "strava", sourceId: "987", name: "Lunch Run", type: "Run", durationSec: 1560, movingSec: 1500, distanceM: 5012, elevationM: 40, avgHr: 151, maxHr: 178, calories: 410 });
    expect(a.start).toBe("2026-10-20T10:30:00.000Z");
    expect(a.track).toBeTruthy();
  });
  it("leaves out what is missing and names an unnamed activity after its type", () => {
    const a = activityFromStrava({ id: 5, type: "Workout", start_date: "2026-10-20T10:30:00Z", elapsed_time: 3000, distance: 0, map: { summary_polyline: "" } })!;
    expect(a.name).toBe("Workout");
    expect(a.distanceM).toBeUndefined();
    expect(a.track).toBeUndefined();
    expect(a.durationSec).toBe(3000);
  });
  it("drops one without a start time", () => {
    expect(activityFromStrava({ id: 1, type: "Run" })).toBeNull();
  });
});
