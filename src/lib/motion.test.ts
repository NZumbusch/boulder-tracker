import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Guards the two things that make the animations safe to have at all.
 *
 * They were switched on by importing `tw-animate-css`, which turned ~50
 * class names that had always been inert into real motion. Two properties
 * have to hold, and both fail silently - the app still builds, still runs,
 * and just feels wrong:
 *
 * 1. The Appearance > Motion setting must actually stop them. That works
 *    through one unlayered `!important` rule; wrapping it in `@layer`, or
 *    dropping the `!important`, would leave the preference doing nothing
 *    for animations while still appearing to work for transitions.
 * 2. Nothing animates for so long that the app feels slow. Whole-screen
 *    fades were 500-700ms, which on every tab change reads as lag.
 */

const SRC = resolve(__dirname, "..");
const APP_CSS = readFileSync(join(SRC, "app.css"), "utf8");

/** Every `class="..."` / `class={\`...\`}` literal in the component tree. */
function classAttributes(): { file: string; value: string }[] {
  const found: { file: string; value: string }[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".svelte")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/class=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        found.push({ file: path.replace(`${SRC}/`, ""), value: match[1] ?? match[2] ?? "" });
      }
    }
  };

  walk(SRC);
  return found;
}

describe("the motion preference", () => {
  it("provides the animation utilities the components use", () => {
    expect(APP_CSS).toContain('@import "tw-animate-css"');
  });

  it("has a reduced-motion rule that covers animations, not just transitions", () => {
    const rule = APP_CSS.match(/:root\[data-motion="reduced"\][\s\S]*?\}/)?.[0];
    expect(rule, "no [data-motion=reduced] rule in app.css").toBeTruthy();
    expect(rule).toMatch(/animation-duration:[^;]*!important/);
    expect(rule).toMatch(/animation-delay:[^;]*!important/);
    expect(rule).toMatch(/animation-iteration-count:[^;]*!important/);
    expect(rule).toMatch(/transition-duration:[^;]*!important/);
  });

  it("keeps that rule unlayered, so it outranks the utilities it overrides", () => {
    // `!important` in an unlayered rule beats a normal declaration in any
    // layer. Move this inside `@layer` and the animation utilities - which
    // Tailwind emits into `@layer utilities` - would start winning.
    const index = APP_CSS.indexOf(':root[data-motion="reduced"]');
    expect(index).toBeGreaterThan(-1);
    const before = APP_CSS.slice(0, index);
    const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0);
    expect(depth, "the reduced-motion rule is nested inside a block or @layer").toBe(0);
  });

  it("also honours the OS setting before a choice has been made", () => {
    expect(APP_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(APP_CSS).toMatch(/:root:not\(\[data-motion\]\)/);
  });
});

describe("animation length", () => {
  const MAX_MS = 300;

  it("never animates anything for longer than the comfortable maximum", () => {
    const tooSlow = classAttributes()
      .filter(({ value }) => value.includes("animate-in"))
      .flatMap(({ file, value }) =>
        [...value.matchAll(/(?:^|\s)duration-(\d+)/g)]
          .map((m) => ({ file, ms: Number(m[1]), value: value.trim().slice(0, 70) }))
          .filter((d) => d.ms > MAX_MS),
      );

    expect(
      tooSlow,
      `These animate for longer than ${MAX_MS}ms, which reads as the app lagging:\n` +
        tooSlow.map((d) => `  ${d.file}: ${d.ms}ms — ${d.value}…`).join("\n"),
    ).toEqual([]);
  });

  it("is actually looking at the components, not an empty list", () => {
    const animated = classAttributes().filter(({ value }) => value.includes("animate-in"));
    expect(animated.length).toBeGreaterThan(20);
  });
});
