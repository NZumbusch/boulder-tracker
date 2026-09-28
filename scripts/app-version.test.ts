import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error - plain .mjs build script
import { appVersion, versionNameFrom, stableNumber } from "./app-version.mjs";

describe("version names", () => {
  it("is 1.<release it heads to>.<commits since the last stable>", () => {
    expect(versionNameFrom(1, 9)).toBe("1.2.9");
    expect(versionNameFrom(0, 226)).toBe("1.1.226");
    expect(stableNumber("stable/12")).toBe(12);
    expect(stableNumber("stable-channel")).toBeNull();
  });

  describe("from a repository", () => {
    let dir = "";
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    const commit = (n: number) => { for (let i = 0; i < n; i++) git("commit", "--allow-empty", "-q", "-m", `c${i}`); };

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "app-version-"));
      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "T");
      git("config", "commit.gpgsign", "false");
      git("config", "tag.gpgsign", "false");
      commit(5);
    });

    it("counts from the start with no stable release yet", () => {
      expect(appVersion(dir)).toEqual({ versionCode: 5, versionName: "1.1.5" });
    });

    it("keeps a promoted build's name, and counts the next release from it", () => {
      git("tag", "stable/1");
      expect(appVersion(dir).versionName).toBe("1.1.5"); // rebuilding the promoted commit
      commit(3);
      expect(appVersion(dir)).toEqual({ versionCode: 8, versionName: "1.2.3" });
      git("tag", "stable/2");
      git("tag", "stable-channel"); // other tags don't count
      commit(1);
      expect(appVersion(dir)).toEqual({ versionCode: 9, versionName: "1.3.1" });
    });
  });
});
