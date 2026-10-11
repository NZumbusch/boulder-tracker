#!/usr/bin/env node
/**
 * The in-app "What's new", from git. Each commit is one entry: its subject,
 * or - to say it better for the people using the app - a `Changelog:` line
 * in the commit message (it may continue on indented lines below), or
 * `Changelog: -` to keep a commit out of the list.
 *
 *   git commit -m "Fix the timer" -m "Changelog: The timer no longer jumps after a pause."
 *
 *   node scripts/changelog.mjs [count]    prints the list as JSON
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SEP_FIELD = "\x1f";
const SEP_ENTRY = "\x1e";

/**
 * A short header and the rest: the subject up to its first colon, " - " or
 * semicolon is the title; what follows (or the `Changelog:` text, when the
 * commit has one) is the detail, shown when the entry is opened.
 */
export function splitTitle(subject, written) {
  const m = subject.match(/^(.{3,70}?)(?::\s+| - |;\s+)(.+)$/s);
  const title = m ? m[1].trim() : subject.length > 70 ? `${subject.slice(0, 67).trimEnd()}…` : subject;
  const rest = m ? m[2].trim() : subject.length > 70 ? subject : "";
  const detail = written ?? rest;
  return { title, ...(detail && detail !== title ? { detail } : {}) };
}

/** Entries from `git log --format=%h<US>%cs<US>%s<US>%b<RS>` output - pure, so the rules are testable. */
export function parseLog(raw) {
  return raw
    .split(SEP_ENTRY)
    .map((chunk) => chunk.replace(/^\n+/, ""))
    .filter(Boolean)
    .map((chunk) => {
      const [hash, date, subject, body = ""] = chunk.split(SEP_FIELD);
      const lines = body.split("\n");
      const at = lines.findIndex((l) => /^changelog:/i.test(l));
      let text = subject.trim();
      if (at !== -1) {
        const rest = [lines[at].replace(/^changelog:\s*/i, "")];
        for (let i = at + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) rest.push(lines[i].trim());
        text = rest.join(" ").trim();
      }
      if (at !== -1 && text === "-") return null;
      return { hash: hash.trim(), date: date.trim(), ...splitTitle(subject.trim(), at !== -1 ? text : undefined) };
    })
    .filter((e) => e && e.hash && e.title);
}

/** The newest `limit` entries of the repository at `cwd`; empty outside a git checkout. */
export function readChangelog(cwd = process.cwd(), limit = 80) {
  try {
    const raw = execFileSync("git", ["log", `-${limit * 2}`, `--format=%h${SEP_FIELD}%cs${SEP_FIELD}%s${SEP_FIELD}%b${SEP_ENTRY}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parseLog(raw).slice(0, limit);
  } catch {
    return [];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(readChangelog(process.cwd(), Number(process.argv[2]) || 80), null, 2));
}
