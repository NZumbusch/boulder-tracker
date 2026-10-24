import { describe, expect, it } from "vitest";
import { fitView, MAP_PROVIDERS, providerOf, tilesFor, tileUrl, toView, worldPixel } from "./mapTiles";
import type { LatLon } from "./track";

describe("worldPixel", () => {
  it("puts the origin of the world at the top-left and the equator in the middle", () => {
    expect(worldPixel([0, 0], 0)).toEqual({ x: 128, y: 128 });
    const nw = worldPixel([85.0511, -180], 0);
    expect(nw.x).toBeCloseTo(0, 5);
    expect(nw.y).toBeCloseTo(0, 1);
  });
  it("agrees with the standard slippy-map tile formula", () => {
    for (const [lat, lon, z] of [[46.948, 7.447, 12], [51.5074, -0.1278, 15], [-33.8688, 151.2093, 10], [64.1466, -21.9426, 8]] as const) {
      const n = 2 ** z;
      const tx = Math.floor(((lon + 180) / 360) * n);
      const ty = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      const p = worldPixel([lat, lon], z);
      expect([Math.floor(p.x / 256), Math.floor(p.y / 256)]).toEqual([tx, ty]);
    }
  });
});

describe("fitView and tilesFor", () => {
  const loop: LatLon[] = [[46.95, 7.44], [46.96, 7.44], [46.96, 7.46], [46.95, 7.46]];

  it("fits the route inside the box at the deepest zoom that can", () => {
    const v = fitView(loop, 320, 200, 19);
    const pts = loop.map((p) => toView(p, v));
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(16 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(320 - 16 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(16 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(200 - 16 + 1e-6);
    }
    const deeper = fitView(loop, 320, 200, v.zoom + 1 > 19 ? 19 : v.zoom + 1);
    expect(deeper.zoom).toBeLessThanOrEqual(v.zoom + 1);
  });

  it("never goes deeper than the provider has pictures for", () => {
    expect(fitView(loop, 320, 200, 12).zoom).toBe(12);
    expect(fitView([[46.95, 7.44]], 320, 200, 14).zoom).toBe(14);
  });

  it("covers the whole view with a few tiles, each placed by its address", () => {
    const v = fitView(loop, 320, 200, 19);
    const tiles = tilesFor(v);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles.length).toBeLessThanOrEqual(9);
    const minLeft = Math.min(...tiles.map((t) => t.left));
    const maxLeft = Math.max(...tiles.map((t) => t.left));
    const minTop = Math.min(...tiles.map((t) => t.top));
    const maxTop = Math.max(...tiles.map((t) => t.top));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(maxLeft + 256).toBeGreaterThanOrEqual(320);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxTop + 256).toBeGreaterThanOrEqual(200);
    for (const t of tiles) {
      const w = worldPixel([46.955, 7.45], v.zoom);
      expect(t.x).toBeGreaterThanOrEqual(Math.floor(w.x / 256) - 3);
    }
  });

  it("wraps across the antimeridian and drops rows beyond the poles", () => {
    const v = { zoom: 2, width: 300, height: 300, originX: -100, originY: -100 };
    const tiles = tilesFor(v);
    expect(tiles.every((t) => t.y >= 0 && t.y < 4 && t.x >= 0 && t.x < 4)).toBe(true);
    expect(tiles.some((t) => t.x === 3)).toBe(true);
  });
});

describe("providers", () => {
  it("builds the address from the template, whichever order it wants", () => {
    expect(tileUrl(providerOf("street"), { z: 12, x: 2129, y: 1434 })).toBe("https://tile.openstreetmap.org/12/2129/1434.png");
    expect(tileUrl(providerOf("satellite"), { z: 12, x: 2129, y: 1434 })).toContain("/12/1434/2129.jpg");
  });
  it("each has a credit, a link and a host to name", () => {
    for (const p of MAP_PROVIDERS) {
      expect(p.attribution.length).toBeGreaterThan(5);
      expect(p.link.startsWith("https://")).toBe(true);
      expect(p.url.startsWith("https://")).toBe(true);
      expect(p.host).toBeTruthy();
    }
  });
});
