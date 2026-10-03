import { describe, expect, it } from "vitest";
import { shouldAskForNotifications, type PromptState } from "./promptRule";

const ready: PromptState = { native: true, loading: false, welcomeDone: true, completedSessions: 1, sessionRunning: false, ratingOpen: false, exampleData: false };

describe("shouldAskForNotifications", () => {
  it("asks once a session has been finished, in the app", () => {
    expect(shouldAskForNotifications(ready)).toBe(true);
    expect(shouldAskForNotifications({ ...ready, completedSessions: 12 })).toBe(true);
  });

  it("never on first launch or during the welcome", () => {
    expect(shouldAskForNotifications({ ...ready, completedSessions: 0 })).toBe(false);
    expect(shouldAskForNotifications({ ...ready, welcomeDone: false })).toBe(false);
    expect(shouldAskForNotifications({ ...ready, loading: true })).toBe(false);
  });

  it("not on the web, where there are no reminders", () => {
    expect(shouldAskForNotifications({ ...ready, native: false })).toBe(false);
  });

  it("not in the middle of a session, while rating one, or on example data", () => {
    expect(shouldAskForNotifications({ ...ready, sessionRunning: true })).toBe(false);
    expect(shouldAskForNotifications({ ...ready, ratingOpen: true })).toBe(false);
    expect(shouldAskForNotifications({ ...ready, exampleData: true })).toBe(false);
  });
});
