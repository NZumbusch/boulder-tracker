import { describe, expect, it } from "vitest";
import { readGpx, readTcx } from "./gpxTcx";

const GPX = `<?xml version="1.0"?><gpx><trk><name>Evening &amp; run</name><trkseg>
<trkpt lat="46.5" lon="7.5"><ele>500.5</ele><time>2026-10-05T06:30:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="46.501" lon="7.5"><ele>501</ele><time>2026-10-05T06:30:10Z</time></trkpt>
<trkpt lat="46.502" lon="7.5"/>
</trkseg></trk></gpx>`;

const TCX = `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Lap><Track>
<Trackpoint><Time>2026-10-05T06:30:00.000Z</Time><Position><LatitudeDegrees>46.5</LatitudeDegrees><LongitudeDegrees>7.5</LongitudeDegrees></Position><AltitudeMeters>500</AltitudeMeters><HeartRateBpm><Value>141</Value></HeartRateBpm></Trackpoint>
<Trackpoint><Time>2026-10-05T06:30:05.000Z</Time><HeartRateBpm><Value>143</Value></HeartRateBpm></Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

describe("readGpx", () => {
  it("reads points with time, elevation and heart rate, and the name", () => {
    const g = readGpx(GPX)!;
    expect(g.name).toBe("Evening & run");
    expect(g.points).toHaveLength(2);
    expect(g.points[0]).toEqual({ t: Date.UTC(2026, 9, 5, 6, 30), lat: 46.5, lon: 7.5, alt: 500.5, hr: 140 });
  });
  it("is null with fewer than two timed points", () => {
    expect(readGpx("<gpx></gpx>")).toBeNull();
  });
});

describe("readTcx", () => {
  it("reads trackpoints, with and without a position, and the sport", () => {
    const t = readTcx(TCX)!;
    expect(t.sport).toBe("Running");
    expect(t.points).toHaveLength(2);
    expect(t.points[0]).toMatchObject({ lat: 46.5, lon: 7.5, alt: 500, hr: 141 });
    expect(t.points[1].lat).toBeUndefined();
    expect(t.points[1].hr).toBe(143);
  });
});
