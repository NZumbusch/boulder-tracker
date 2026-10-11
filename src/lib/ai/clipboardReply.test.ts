import { describe, it, expect } from "vitest";
import { looksLikeReply } from "./clipboardReply";

describe("looksLikeReply", () => {
  it("takes a JSON object, with or without a fence", () => {
    expect(looksLikeReply('{"summary":"x"}')).toBe(true);
    expect(looksLikeReply('  \n{ "weeks": [] }')).toBe(true);
    expect(looksLikeReply('```json\n{"summary":"x"}\n```')).toBe(true);
  });
  it("leaves other clipboard text alone", () => {
    expect(looksLikeReply("Here is your plan: {...}")).toBe(false);
    expect(looksLikeReply("a link https://example.com")).toBe(false);
    expect(looksLikeReply("{}")).toBe(false);
    expect(looksLikeReply("")).toBe(false);
  });
});
