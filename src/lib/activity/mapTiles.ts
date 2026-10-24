import type { LatLon } from "./track";

/**
 * Map pictures behind a route, from free public tile servers - no account,
 * no key. Pure maths here (Web Mercator, the scheme every tile server uses);
 * `components/history/ActivityMap.svelte` draws it.
 *
 * Providers are data, not code: their addresses change and their rules are
 * theirs (OpenStreetMap's policy asks apps not to hard-code its server), so a
 * provider can be swapped by editing one entry. All three are free for
 * light, personal use with the attribution shown; none may be used for
 * downloading areas in bulk, which this never does (it fetches the handful
 * of tiles under the route being looked at).
 */

export type MapStyle = "street" | "terrain" | "satellite";

export interface MapProvider {
  id: MapStyle;
  label: string;
  /** {z}/{x}/{y} tile address. */
  url: string;
  /** Deepest zoom the server has pictures for; beyond it the last level is stretched. */
  maxZoom: number;
  /** Credit that must be visible on the map. */
  attribution: string;
  /** Where the credit and terms live. */
  link: string;
  /** Who is told what area is on screen (shown before first use and in the privacy policy). */
  host: string;
}

export const MAP_PROVIDERS: MapProvider[] = [
  {
    id: "street",
    label: "Street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
    link: "https://www.openstreetmap.org/copyright",
    host: "OpenStreetMap",
  },
  {
    id: "terrain",
    label: "Terrain",
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution: "© OpenStreetMap contributors, SRTM · © OpenTopoMap (CC-BY-SA)",
    link: "https://opentopomap.org/about",
    host: "OpenTopoMap",
  },
  {
    id: "satellite",
    label: "Satellite",
    // Sentinel-2 cloudless: free for non-commercial use (CC BY-NC-SA 4.0), about 10 m per pixel, so coarse up close.
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
    maxZoom: 14,
    attribution: "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2021)",
    link: "https://cloudless.eox.at/documentation/license",
    host: "EOX",
  },
];

export const providerOf = (style: MapStyle): MapProvider => MAP_PROVIDERS.find((p) => p.id === style) ?? MAP_PROVIDERS[0];

export const TILE = 256;

/** Pixel on the world map at zoom z (0..256·2^z each way). */
export function worldPixel([lat, lon]: LatLon, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

export interface MapView {
  zoom: number;
  width: number;
  height: number;
  /** World pixel of the view's top-left corner. */
  originX: number;
  originY: number;
}

export interface PlacedTile {
  /** Tile address, wrapped to the world. */
  z: number;
  x: number;
  y: number;
  /** Where its top-left sits in the view, px. */
  left: number;
  top: number;
}

/** The deepest zoom (up to `maxZoom`) at which the whole route fits the box, centred. */
export function fitView(points: LatLon[], width: number, height: number, maxZoom: number, margin = 16): MapView {
  const fits = (z: number) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const w = worldPixel(p, z);
      minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
      minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
    }
    return { ok: maxX - minX <= width - 2 * margin && maxY - minY <= height - 2 * margin, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  };
  let zoom = 2;
  let found = fits(2);
  for (let z = Math.max(2, maxZoom); z >= 2; z--) {
    const f = fits(z);
    if (f.ok || z === 2) { zoom = z; found = f; break; }
  }
  return { zoom, width, height, originX: found.cx - width / 2, originY: found.cy - height / 2 };
}

/** The tiles that cover the view, with longitude wrapped and rows outside the world dropped. */
export function tilesFor(view: MapView): PlacedTile[] {
  const n = 2 ** view.zoom;
  const out: PlacedTile[] = [];
  const x0 = Math.floor(view.originX / TILE);
  const x1 = Math.floor((view.originX + view.width - 1) / TILE);
  const y0 = Math.floor(view.originY / TILE);
  const y1 = Math.floor((view.originY + view.height - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx++) {
      out.push({ z: view.zoom, x: ((tx % n) + n) % n, y: ty, left: tx * TILE - view.originX, top: ty * TILE - view.originY });
    }
  }
  return out;
}

/** A point in view pixels. */
export function toView(p: LatLon, view: MapView): { x: number; y: number } {
  const w = worldPixel(p, view.zoom);
  return { x: w.x - view.originX, y: w.y - view.originY };
}

export function tileUrl(provider: MapProvider, t: Pick<PlacedTile, "z" | "x" | "y">): string {
  return provider.url.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
}

const KEY = "activityMapStyle";

/** The map style last picked on this device ("route" when none, or storage is unavailable). */
export function lastMapStyle(): MapStyle {
  try {
    const v = localStorage.getItem(KEY);
    return v === "terrain" || v === "satellite" ? v : "street";
  } catch {
    return "street";
  }
}

export function rememberMapStyle(style: MapStyle): void {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // Private window or blocked storage: the choice just doesn't stick.
  }
}
