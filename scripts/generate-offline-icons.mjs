#!/usr/bin/env node
/**
 * Regenerates the bundled icon set in `src/lib/icons/offline-icons.json`.
 *
 * `@iconify/svelte` fetches icon data from api.iconify.design on demand and
 * caches it in localStorage. That makes every icon in the app a network
 * dependency: on a device with no connection and a cold cache - a fresh
 * install, cleared data, or a gym basement - the buttons render empty.
 * Which is exactly what happened.
 *
 * So the icons the app actually uses are fetched once, here, and committed.
 * `src/lib/icons/index.ts` registers them with `addCollection` before the
 * app mounts, so nothing is ever requested at runtime.
 *
 * Run after adding a new icon:
 *
 *     node scripts/generate-offline-icons.mjs
 *
 * `offlineIcons.test.ts` fails if a referenced icon isn't in the bundle, so
 * forgetting this is caught in the test run rather than in a gym.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(SRC, "lib", "icons", "offline-icons.json");

/**
 * Every icon name the source refers to, as `prefix:name`.
 *
 * @param {string} dir directory to scan recursively
 * @returns {string[]} sorted, de-duplicated names
 */
export function collectIconNames(dir) {
  /** @type {Set<string>} */
  const names = new Set();

  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(svelte|ts|js)$/.test(entry)) continue;
      if (/\.test\.ts$/.test(entry)) continue;

      const source = readFileSync(path, "utf8");
      // Matches a quoted `prefix:name` anywhere - not just in an `icon=`
      // prop - because icon names are also passed through variables,
      // snippet arguments and config arrays (`sectionHeader('ic:...')`,
      // `MODES`, `FIELDS`), and those must be bundled too.
      for (const match of source.matchAll(/['"`]([a-z][a-z0-9]*:[a-z0-9][a-z0-9-]*)['"`]/g)) {
        names.add(match[1]);
      }
    }
  };

  walk(dir);
  return [...names].sort();
}

/** Iconify prefixes this project actually uses. Anything else matching the pattern is not an icon. */
const ICON_PREFIXES = new Set(["ic"]);

/** @param {string} name */
function isIconName(name) {
  return ICON_PREFIXES.has(name.split(":")[0]);
}

async function main() {
  const all = collectIconNames(SRC);
  const iconNames = all.filter(isIconName);

  if (iconNames.length === 0) {
    console.error("No icon names found - refusing to write an empty bundle.");
    process.exit(1);
  }

  /** @type {Record<string, unknown>} */
  const collections = {};

  for (const prefix of ICON_PREFIXES) {
    const names = iconNames
      .filter((n) => n.startsWith(`${prefix}:`))
      .map((n) => n.slice(prefix.length + 1));
    if (names.length === 0) continue;

    const url = `https://api.iconify.design/${prefix}.json?icons=${names.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Iconify API returned ${res.status} for "${prefix}"`);

    const data = await res.json();
    const fetched = Object.keys(data.icons ?? {});
    const missing = names.filter((n) => !fetched.includes(n) && !(data.aliases ?? {})[n]);
    if (missing.length > 0) {
      // A name that doesn't exist renders as nothing, silently. Better to
      // fail here than to ship an invisible button.
      throw new Error(`Icons not found in "${prefix}": ${missing.join(", ")}`);
    }

    collections[prefix] = data;
    console.log(`${prefix}: bundled ${fetched.length} icons`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(collections, null, 0) + "\n");
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
