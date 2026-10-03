import type { ValidationIssue } from "./schema";

/**
 * Collapses validation output into something a human can act on.
 *
 * Example: a 15-week plan can produce ~170 issues that are really three
 * distinct problems (a string where an array belonged, prose in `cadence`,
 * prose in `climbingStyle`) repeated across every week.
 * Grouping turns "170 errors" into "3 problems", which is both the truth and
 * something that can be fixed.
 */
export interface IssueGroup {
  /** The field the group is about, with array indices collapsed: "weeks[].workouts[].exercises[].values.cadence". */
  label: string;
  /** A representative message, with the specific offending value removed. */
  message: string;
  count: number;
  /** Up to three real occurrences, values intact, for "show me an actual one". */
  examples: { path: string; message: string }[];
}

/** "weeks[3].workouts[1]..." -> "weeks[].workouts[]..." so repeats collapse. */
function generalizePath(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

/**
 * Strips the quoted offending value out of a message so that
 * `got "Mixed"` and `got "Performance"` count as the same problem.
 */
function generalizeMessage(message: string): string {
  return message.replace(/"[^"]*"/g, "…").replace(/\s+/g, " ").trim();
}

export function groupIssues(issues: ValidationIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const label = generalizePath(issue.path);
    const message = generalizeMessage(issue.message);
    const key = `${label}::${message}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 3) existing.examples.push({ path: issue.path, message: issue.message });
    } else {
      groups.set(key, { label, message, count: 1, examples: [{ path: issue.path, message: issue.message }] });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * A compact correction note to paste back into the AI chat.
 *
 * Deliberately phrased as instructions rather than a raw error dump: an
 * error list makes a model apologise and re-emit the same plan, whereas a
 * short list of rules plus one concrete example per rule reliably gets a
 * corrected document. Capped so it stays pasteable.
 */
export function formatIssuesForAI(issues: ValidationIssue[]): string {
  const groups = groupIssues(issues);
  if (groups.length === 0) return "";
  const lines = groups.slice(0, 20).map((group) => {
    const field = group.label.split(".").pop() || group.label;
    const example = group.examples[0];
    return `- "${field}": ${group.message} (${group.count} occurrence${group.count === 1 ? "" : "s"}, e.g. at ${example.path})`;
  });
  return `Your JSON did not match the required schema. Fix exactly these problems and resend the COMPLETE corrected JSON document - no commentary, no code fences, and do not shorten or summarise the plan:

${lines.join("\n")}

Re-read the "values" reference in my original message: numeric fields take bare JSON numbers, array fields take JSON arrays, and fields with an allowed-value list accept only those exact strings. Anything you cannot express in those fields belongs in "notes".`;
}
