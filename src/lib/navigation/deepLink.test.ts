import { describe, it, expect } from "vitest";
import { parseDeepLink } from "./deepLink";

describe("parseDeepLink", () => {
  it("reads the shortcut targets", () => {
    expect(parseDeepLink("bouldertracker://session")).toEqual({ kind: "session" });
    expect(parseDeepLink("bouldertracker://quicklog")).toEqual({ kind: "quickLog" });
    expect(parseDeepLink("bouldertracker://metrics/")).toEqual({ kind: "metrics" });
    expect(parseDeepLink("BoulderTracker://Session?from=widget")).toEqual({ kind: "session" });
  });

  it("can name the quick-log form to open", () => {
    expect(parseDeepLink("bouldertracker://quicklog/pain")).toEqual({ kind: "quickLog", action: "pain" });
    expect(parseDeepLink("bouldertracker://quicklog/Bodyweight/")).toEqual({ kind: "quickLog", action: "bodyweight" });
    expect(parseDeepLink("bouldertracker://quicklog/nonsense")).toEqual({ kind: "quickLog" });
  });

  it("opens a tab by name", () => {
    expect(parseDeepLink("bouldertracker://view/plan")).toEqual({ kind: "view", view: "plan" });
    expect(parseDeepLink("bouldertracker://view/nowhere")).toBeNull();
    expect(parseDeepLink("bouldertracker://view")).toBeNull();
  });

  it("ignores anything else", () => {
    expect(parseDeepLink(undefined)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("https://example.com/session")).toBeNull();
    expect(parseDeepLink("bouldertracker://delete-everything")).toBeNull();
  });
});
