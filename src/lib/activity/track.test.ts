import { describe, expect, it } from "vitest";
import { decodeTrack, distanceBetween, encodeTrack, projectTrack, routeOf, simplifyTrack, trackLength, type LatLon } from "./track";

describe("polyline", () => {
  it("round-trips, and matches the reference example", () => {
    const ref: LatLon[] = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodeTrack(ref)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(decodeTrack("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual(ref);
    const pts: LatLon[] = [[46.50001, 7.5], [46.5004, 7.50123], [-33.9, 151.2]];
    expect(decodeTrack(encodeTrack(pts))).toEqual(pts);
  });
  it("copes with an empty or cut string", () => {
    expect(decodeTrack("")).toEqual([]);
    expect(decodeTrack("_p~iF~ps|U_ul")).toEqual([[38.5, -120.2]]);
  });
});

describe("distance and simplify", () => {
  it("measures metres", () => {
    expect(distanceBetween([0, 0], [0, 0.001])).toBeCloseTo(111.2, 0);
    expect(trackLength([[0, 0], [0, 0.001], [0.001, 0.001]])).toBeCloseTo(222.4, 0);
  });
  it("keeps a corner and drops a straight line's middle", () => {
    const line: LatLon[] = [];
    for (let i = 0; i <= 50; i++) line.push([46 + i * 0.0001, 7]);
    for (let i = 1; i <= 50; i++) line.push([46.005, 7 + i * 0.0001]);
    const out = simplifyTrack(line);
    expect(out.length).toBe(3);
    expect(out[1]).toEqual([46.005, 7]);
  });
  it("never returns more than the cap", () => {
    const wiggle: LatLon[] = Array.from({ length: 3000 }, (_, i) => [46 + Math.sin(i / 7) * 0.01, 7 + i * 0.00005]);
    expect(simplifyTrack(wiggle, 1, 120).length).toBeLessThanOrEqual(120);
  });
});

describe("routeOf", () => {
  it("is undefined for indoor or tiny recordings", () => {
    expect(routeOf([{ }, { }])).toBeUndefined();
    expect(routeOf([{ lat: 46, lon: 7 }, { lat: 46.00001, lon: 7 }])).toBeUndefined();
  });
  it("encodes a real line", () => {
    const r = routeOf([{ lat: 46, lon: 7 }, { lat: 46.01, lon: 7.01 }, { lat: 46.02, lon: 7 }])!;
    expect(decodeTrack(r)).toHaveLength(3);
  });
});

describe("projectTrack", () => {
  it("fits the box with the margin and keeps north up", () => {
    const p = projectTrack([[46, 7], [46.01, 7.0]], 100, 100, 10);
    expect(p[0].y).toBeGreaterThan(p[1].y);
    expect(p[1].y).toBeCloseTo(10, 5);
    expect(p[0].y).toBeCloseTo(90, 5);
  });
});
