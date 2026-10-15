import { describe, it, expect } from "vitest";
import { GLOSSARY } from "./glossary";
import { findPage } from "../settings/tree";

describe("glossary", () => {
  for (const [id, term] of Object.entries(GLOSSARY)) {
    it(`${id} has a title and text, and its settings page exists`, () => {
      expect(term.title.trim()).not.toBe("");
      expect(term.paragraphs.length).toBeGreaterThan(0);
      for (const p of term.paragraphs) expect(p.trim()).not.toBe("");
      if (term.where) expect(() => findPage(term.where!)).not.toThrow();
    });
  }
});
