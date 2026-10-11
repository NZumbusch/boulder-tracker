import { describe, expect, it } from "vitest";
import { feedbackBody, feedbackMailto, issueUrl, platformLabel } from "./feedback";

const ctx = { version: "1.2.57", build: 274, commit: "d095d290a50541198a539a62e14400dae756be9a", platform: "Android app", userAgent: "UA/1.0" };
const entry = (message: string, at = "2026-10-03T10:00:00Z") => ({ at, message, level: "error" as const });

describe("platformLabel", () => {
  it("names how the app is running", () => {
    expect(platformLabel({ native: true, standalone: false })).toBe("Android app");
    expect(platformLabel({ native: false, standalone: true })).toBe("Installed web app");
    expect(platformLabel({ native: false, standalone: false })).toBe("Web app in a browser");
  });
});

describe("feedbackBody", () => {
  it("states version, build, commit, platform and browser, and leaves room to write", () => {
    const body = feedbackBody(ctx);
    expect(body).toMatch(/What happened:/);
    expect(body).toMatch(/Version 1\.2\.57 \(build 274, commit d095d29\)/);
    expect(body).toMatch(/Android app/);
    expect(body).toMatch(/UA\/1\.0/);
  });

  it("copes with a missing build or commit (a web or dev build)", () => {
    const body = feedbackBody({ ...ctx, build: null, commit: "" });
    expect(body).toMatch(/Version 1\.2\.57\b/);
    expect(body).not.toMatch(/build null|commit \)/);
  });

  it("adds the error log only when given, newest first, capped", () => {
    expect(feedbackBody(ctx)).not.toMatch(/Error log/);
    const many = Array.from({ length: 12 }, (_, i) => entry(`failure ${i}`));
    const body = feedbackBody({ ...ctx, errors: many });
    expect(body).toMatch(/Error log/);
    expect(body).toMatch(/failure 0/);
    expect(body).toMatch(/failure 4/);
    expect(body).not.toMatch(/failure 5/);
  });

  it("truncates a very long entry so the link stays usable", () => {
    const body = feedbackBody({ ...ctx, errors: [entry("x".repeat(5000))] });
    expect(body.length).toBeLessThan(2600);
  });
});

describe("links", () => {
  it("builds an email to the developer with everything encoded", () => {
    const url = feedbackMailto(ctx);
    expect(url.startsWith("mailto:info@nathanzumbusch.de?subject=")).toBe(true);
    expect(decodeURIComponent(url)).toMatch(/Boulder Tracker feedback \(1\.2\.57\)/);
    expect(url).not.toMatch(/\n| /);
  });

  it("builds a new-issue link on GitHub with the same details", () => {
    const url = issueUrl(ctx);
    expect(url.startsWith("https://github.com/NZumbusch/boulder-tracker/issues/new?")).toBe(true);
    expect(new URL(url).searchParams.get("body")).toMatch(/build 274/);
  });
});
