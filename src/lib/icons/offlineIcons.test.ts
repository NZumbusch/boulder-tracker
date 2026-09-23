import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import bundled from "./offline-icons.json";
import { collectIconNames } from "../../../scripts/generate-offline-icons.mjs";

/**
 * The guard on offline icons.
 *
 * `@iconify/svelte` fetches icon data from a CDN on first render, so an
 * icon that isn't in the committed bundle works perfectly on a laptop and
 * renders as an empty button on a phone with no signal. There is no error
 * and no warning - which is exactly how the whole nav bar quietly lost its
 * icons.
 *
 * So the same extraction the generator uses runs here, and every name it
 * finds must be in the bundle. Adding an icon without re-running
 * `node scripts/generate-offline-icons.mjs` fails the test run instead of
 * failing in a gym.
 */

const SRC = resolve(__dirname, "../..");

/** Icon prefixes this project uses - the generator's own list. */
const ICON_PREFIXES = ["ic"];

const referenced = (collectIconNames(SRC) as string[]).filter((name) =>
  ICON_PREFIXES.includes(name.split(":")[0]),
);

/** Every `prefix:name` the bundle can actually resolve, aliases included. */
const available = new Set<string>();
for (const [prefix, collection] of Object.entries(bundled as Record<string, any>)) {
  for (const name of Object.keys(collection.icons ?? {})) available.add(`${prefix}:${name}`);
  for (const name of Object.keys(collection.aliases ?? {})) available.add(`${prefix}:${name}`);
}

describe("the offline icon bundle", () => {
  it("finds the icons the source refers to", () => {
    expect(referenced.length).toBeGreaterThan(50);
  });

  it("carries every icon the app can render", () => {
    const missing = referenced.filter((name) => !available.has(name));
    expect(
      missing,
      `Not in the offline bundle, so these render as empty space with no connection:\n` +
        `  ${missing.join("\n  ")}\n` +
        `Run: node scripts/generate-offline-icons.mjs`,
    ).toEqual([]);
  });

  it("carries real icon bodies, not empty placeholders", () => {
    for (const [prefix, collection] of Object.entries(bundled as Record<string, any>)) {
      for (const [name, icon] of Object.entries(collection.icons ?? {})) {
        expect((icon as { body?: string }).body, `${prefix}:${name} has no body`).toBeTruthy();
      }
    }
  });

  it("declares the dimensions the renderer needs", () => {
    for (const collection of Object.values(bundled as Record<string, any>)) {
      expect(collection.prefix).toBeTruthy();
      expect(typeof collection.width).toBe("number");
      expect(typeof collection.height).toBe("number");
    }
  });

  it("does not ship icons nothing refers to", () => {
    // Not correctness, just drift: the bundle is generated from the source,
    // so an extra entry means it was hand-edited or an icon was removed
    // without regenerating.
    const orphans = [...available].filter((name) => !referenced.includes(name));
    expect(orphans).toEqual([]);
  });
});
