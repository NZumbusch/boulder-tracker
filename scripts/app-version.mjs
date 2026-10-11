#!/usr/bin/env node
/**
 * The app's version, from git - one answer for the APK (android/app/
 * build.gradle), the in-app updater's version file (write-update-manifest)
 * and the web app (vite.config.js).
 *
 *   versionCode  the commit count. Only ever goes up, which is what lets an
 *                update install over the last build; never change this.
 *   versionName  "1.<release>.<commits>":
 *                - release: the stable release this build is heading to -
 *                  one more than the stable releases before it. Each
 *                  promotion to stable tags its commit `stable/<n>`.
 *                - commits: how many commits since the last stable one.
 *                A promoted build keeps its name (stable #2 = "1.2.9"),
 *                builds after it count from "1.3.1".
 *
 *   node scripts/app-version.mjs            prints the name
 *   node scripts/app-version.mjs --code     prints the code
 *   node scripts/app-version.mjs --json     prints both
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const STABLE_TAG_PREFIX = "stable/";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/**
 * The name from the three facts it depends on - pure, so the rule is
 * testable without a repository.
 *
 * @param {number} releasesBefore stable releases strictly before this build
 * @param {number} commitsSince   commits since the latest of them (or since the start)
 */
export function versionNameFrom(releasesBefore, commitsSince) {
  return `1.${releasesBefore + 1}.${commitsSince}`;
}

/** The stable release number in a tag like "stable/3", or null. */
export function stableNumber(tag) {
  const m = new RegExp(`^${STABLE_TAG_PREFIX.replace("/", "\\/")}(\\d+)$`).exec(tag);
  return m ? Number(m[1]) : null;
}

/**
 * Reads the version for `rev` (default HEAD) from the repository at `cwd`.
 * Stable tags on `rev` itself don't count as "before" it, so rebuilding a
 * promoted commit gives it the same name it was promoted under.
 */
export function appVersion(cwd = process.cwd(), rev = "HEAD") {
  const versionCode = Number(git(cwd, "rev-list", "--count", rev));
  const onRev = new Set(git(cwd, "tag", "--points-at", rev, "--list", `${STABLE_TAG_PREFIX}*`).split("\n").filter(Boolean));
  const before = git(cwd, "tag", "--merged", rev, "--list", `${STABLE_TAG_PREFIX}*`)
    .split("\n")
    .filter((t) => t && !onRev.has(t) && stableNumber(t) !== null)
    .sort((a, b) => stableNumber(a) - stableNumber(b));
  const latest = before[before.length - 1];
  const commitsSince = latest ? Number(git(cwd, "rev-list", "--count", `${latest}..${rev}`)) : versionCode;
  return { versionCode, versionName: versionNameFrom(before.length, commitsSince) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = appVersion();
  const flag = process.argv[2];
  console.log(flag === "--code" ? v.versionCode : flag === "--json" ? JSON.stringify(v) : v.versionName);
}
