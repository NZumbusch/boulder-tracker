#!/usr/bin/env node
/**
 * CI step after the release APK is built: copies it next to the web app and
 * writes the version file the in-app updater reads (src/lib/update/).
 *
 *   node scripts/write-update-manifest.mjs <apk> <outDir>
 *
 * The version file holds only what the updater needs: the build number
 * (commit count, same as the APK's versionCode), the APK's SHA-256 and
 * size, the commit it was built from, and recent commit subjects as
 * "what's new". No author names, emails or anything else from git.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const [apk, outDir] = process.argv.slice(2);
if (!apk || !outDir) {
  console.error("usage: write-update-manifest.mjs <apk> <outDir>");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const versionCode = Number(git("rev-list", "--count", "HEAD"));
if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error("Needs the full git history (fetch-depth: 0)");

const changes = git("log", "-30", "--no-merges", "--format=%H%x09%s")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, ...subject] = line.split("\t");
    return { versionCode: Number(git("rev-list", "--count", sha)), subject: subject.join("\t") };
  });

const bytes = readFileSync(apk);
const manifest = {
  versionCode,
  versionName: `1.0.${versionCode}`,
  apk: "boulder-tracker.apk",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  size: statSync(apk).size,
  commit: git("rev-parse", "HEAD"),
  publishedAt: new Date().toISOString(),
  changes,
};

mkdirSync(outDir, { recursive: true });
copyFileSync(apk, join(outDir, manifest.apk));
writeFileSync(join(outDir, "version.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Published build ${versionCode} (${(manifest.size / 1048576).toFixed(1)} MB, sha256 ${manifest.sha256.slice(0, 12)}…)`);
