import { describe, it, expect } from "vitest";
import { hasPromptEnd, JSON_REPLY_RULE, PROMPT_END, promptFileName, REPLY_FILE_NAME, withPromptEnd } from "./promptDelivery";
import { buildChangeSetInstructions } from "./changeSetPrompt";

describe("withPromptEnd", () => {
  it("names the end line at the top and ends with it", () => {
    const p = withPromptEnd("Plan my week.\n\n");
    expect(p.startsWith("(This prompt ends with the line")).toBe(true);
    expect(p.endsWith(`Plan my week.\n\n${PROMPT_END}`)).toBe(true);
    expect(hasPromptEnd(p)).toBe(true);
  });

  it("tells a prompt cut short", () => {
    const p = withPromptEnd("x".repeat(1000));
    expect(hasPromptEnd(p.slice(0, 600))).toBe(false);
  });
});

describe("reply rules", () => {
  it("let the AI answer with a JSON file, never in parts", () => {
    expect(JSON_REPLY_RULE).toContain(REPLY_FILE_NAME);
    expect(JSON_REPLY_RULE).toContain("Never split");
    expect(buildChangeSetInstructions()).toContain(JSON_REPLY_RULE);
  });
});

describe("promptFileName", () => {
  it("is a dated text file", () => {
    expect(promptFileName(new Date(2026, 10, 15))).toBe("boulder-tracker-prompt-2026-11-15.txt");
  });
});
