import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TUNABLES } from "../preferences/tunables";

/**
 * A tunable is only a setting if some Settings page shows it. Layout entries are listed by id on their page
 * (`<TunablesSettings ids={[...]}>`); one that was added to the registry and never put on a page is a setting
 * nobody can reach. (Training model and outdoor entries are shown whole, by topic.)
 */
describe("every tunable is on a Settings page", () => {
  const dir = join(__dirname, "../../components/settings");
  const source = readdirSync(dir).filter((f) => f.endsWith(".svelte")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

  it("names each layout entry on a page", () => {
    const missing = TUNABLES.filter((t) => t.topic === "layout" && !source.includes(`'${t.id}'`)).map((t) => t.id);
    expect(missing).toEqual([]);
  });
});
