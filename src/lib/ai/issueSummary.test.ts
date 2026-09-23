import { describe, it, expect } from "vitest";
import { groupIssues, formatIssuesForAI } from "./issueSummary";
import type { ValidationIssue } from "./schema";

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

describe("groupIssues", () => {
  it("collapses the same problem repeated across weeks into one group", () => {
    const issues = [
      issue("weeks[0].workouts[0].exercises[0].values.cadence", 'Expected a number, got "Moderate".'),
      issue("weeks[1].workouts[2].exercises[0].values.cadence", 'Expected a number, got "Warm-up pyramid".'),
      issue("weeks[7].workouts[3].exercises[1].values.cadence", 'Expected a number, got "Relaxed".'),
    ];
    const groups = groupIssues(issues);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].label).toBe("weeks[].workouts[].exercises[].values.cadence");
  });

  it("keeps genuinely different problems apart", () => {
    const groups = groupIssues([
      issue("weeks[0].workouts[0].exercises[0].values.cadence", 'Expected a number, got "Moderate".'),
      issue("weeks[0].workouts[0].exercises[0].values.mobilityType", 'Expected an array of strings, got "Full Body".'),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("orders the most frequent problem first", () => {
    const groups = groupIssues([
      issue("weeks[0].values.a", "Rare problem."),
      issue("weeks[0].values.b", 'Common problem, got "x".'),
      issue("weeks[1].values.b", 'Common problem, got "y".'),
    ]);
    expect(groups[0].count).toBe(2);
  });

  it("keeps at most three real examples, values intact", () => {
    const issues = Array.from({ length: 10 }, (_, i) =>
      issue(`weeks[${i}].values.cadence`, `Expected a number, got "value-${i}".`),
    );
    const [group] = groupIssues(issues);
    expect(group.count).toBe(10);
    expect(group.examples).toHaveLength(3);
    expect(group.examples[0].message).toContain("value-0");
  });

  it("returns nothing for no issues", () => {
    expect(groupIssues([])).toEqual([]);
  });
});

describe("formatIssuesForAI", () => {
  it("asks for a complete corrected document, not a diff", () => {
    const text = formatIssuesForAI([
      issue("weeks[0].workouts[0].exercises[0].values.cadence", 'Expected a number, got "Moderate".'),
    ]);
    expect(text).toContain("COMPLETE corrected JSON");
    expect(text).toContain("cadence");
    expect(text).toMatch(/do not shorten or summarise/i);
  });

  it("reports occurrence counts rather than repeating every line", () => {
    const issues = Array.from({ length: 40 }, (_, i) =>
      issue(`weeks[${i}].values.cadence`, `Expected a number, got "v${i}".`),
    );
    const text = formatIssuesForAI(issues);
    expect(text).toContain("40 occurrences");
    expect(text.split("\n").length).toBeLessThan(15);
  });

  it("is empty when there is nothing to fix", () => {
    expect(formatIssuesForAI([])).toBe("");
  });
});
