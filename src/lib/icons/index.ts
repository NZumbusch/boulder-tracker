import { addCollection } from "@iconify/svelte";
import bundled from "./offline-icons.json";

/**
 * Registers every icon the app uses, from a bundle committed to the repo.
 *
 * By default `@iconify/svelte` fetches icon data from api.iconify.design
 * the first time each icon renders and caches it in localStorage. That
 * quietly makes every icon a network dependency, and it fails in exactly
 * the situation this app is used in: a phone in a gym with no signal, or a
 * fresh install whose cache is cold. The symptom is not an error - the
 * buttons simply render empty, which is how it went unnoticed.
 *
 * Registering the collections up front means nothing is ever requested at
 * runtime. `scripts/generate-offline-icons.mjs` regenerates the bundle,
 * and `offlineIcons.test.ts` fails if the source refers to an icon the
 * bundle doesn't carry - so a new icon can't silently go missing offline.
 *
 * Must run before the first `<Icon>` renders, hence the import at the top
 * of `main.ts` rather than lazily from a component.
 */
export function registerOfflineIcons(): void {
  for (const collection of Object.values(bundled)) {
    addCollection(collection as Parameters<typeof addCollection>[0]);
  }
}
