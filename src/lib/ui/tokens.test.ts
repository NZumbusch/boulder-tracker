import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The colour tokens in app.css that text relies on: AA (4.5:1) on the surfaces they are used on, in every theme. */
const CSS = readFileSync(resolve(__dirname, "../../app.css"), "utf8");

function block(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  return CSS.slice(start, CSS.indexOf("\n}", start));
}
function token(css: string, name: string): string | null {
  return css.match(new RegExp(`--theme-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? null;
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = { dark: ":root", light: ':root[data-theme="light"]', contrast: ':root[data-theme="contrast"]' };
// A theme block only overrides what differs from the dark one.
const dark = block(":root");

describe("content-faint", () => {
  for (const [name, selector] of Object.entries(THEMES)) {
    it(`reads at 4.5:1 on the surface and the page in the ${name} theme`, () => {
      const css = block(selector);
      const faint = token(css, "content-faint") ?? token(dark, "content-faint");
      const surface = token(css, "surface") ?? token(dark, "surface");
      const bg = token(css, "app-bg") ?? token(dark, "app-bg");
      expect(faint).toBeTruthy();
      expect(ratio(faint!, surface!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(faint!, bg!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("is exposed as a colour utility", () => {
    expect(CSS).toContain("--color-content-faint: var(--theme-content-faint)");
  });
});

describe("type ramp", () => {
  it("never sets micro or caption below 11px", () => {
    for (const m of CSS.matchAll(/--typescale-(?:micro|caption):\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(11);
  });
});
