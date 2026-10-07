import { describe, it, expect } from "vitest";
import { parseJsonReply } from "./parseJson";

describe("parseJsonReply", () => {
  it("reads plain JSON", () => expect(parseJsonReply('{"a":1}')).toEqual({ ok: true, value: { a: 1 } }));
  it("reads a fenced reply", () => expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } }));
  it("reads a reply with a sentence before the fence", () => {
    expect(parseJsonReply('Here\'s your plan!\n```json\n{"a":[1,2]}\n```\nEnjoy.')).toEqual({ ok: true, value: { a: [1, 2] } });
  });
  it("reads a reply with text around bare JSON", () => {
    expect(parseJsonReply('Sure: {"a":{"b":2}} - let me know.')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });
  it("says a cut-off reply is cut off", () => {
    const r = parseJsonReply('Here: {"a":{"b":2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/cut off/);
  });
  it("gives a plain message for non-JSON, with no parser jargon", () => {
    const r = parseJsonReply("hello there");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toMatch(/Unexpected|position/);
  });
});
