import { APP_INFO } from "./appInfo";
import type { LoggedError } from "./errorReporting";

/**
 * "Report a bug / send feedback": a prefilled email or GitHub issue that
 * says which build, where it runs and (only if the person ticks it) the
 * latest entries of the on-device error log. Pure, so it's tested; the
 * Settings → About card feeds it and opens the link. Nothing is sent by the
 * app itself - the person's mail app or browser does it.
 */
export interface FeedbackContext {
  version: string;
  /** The installed build number (Android app only). */
  build: number | null;
  commit: string;
  platform: string;
  userAgent: string;
  /** Recent errors, newest first - only when the person chose to include them. */
  errors?: LoggedError[];
}

const ERROR_ENTRIES = 5;
const ENTRY_MAX = 400;

export function platformLabel(env: { native: boolean; standalone: boolean }): string {
  if (env.native) return "Android app";
  return env.standalone ? "Installed web app" : "Web app in a browser";
}

export function feedbackBody(c: FeedbackContext): string {
  const build = [c.build ? `build ${c.build}` : "", c.commit ? `commit ${c.commit.slice(0, 7)}` : ""].filter(Boolean).join(", ");
  const lines = ["What happened:", "", "", "What I expected:", "", "", "---", `Version ${c.version}${build ? ` (${build})` : ""}`, c.platform, c.userAgent];
  if (c.errors?.length) {
    lines.push("", "Error log (newest first):");
    for (const e of c.errors.slice(0, ERROR_ENTRIES)) {
      const message = e.message.length > ENTRY_MAX ? `${e.message.slice(0, ENTRY_MAX)}…` : e.message;
      lines.push(`[${e.at}] ${(e.level ?? "error").toUpperCase()}: ${message}`);
    }
  }
  return lines.join("\n");
}

export function feedbackMailto(c: FeedbackContext): string {
  const subject = `Boulder Tracker feedback (${c.version})`;
  return `mailto:${APP_INFO.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackBody(c))}`;
}

export function issueUrl(c: FeedbackContext): string {
  const params = new URLSearchParams({ title: "", body: feedbackBody(c) });
  return `${APP_INFO.repoUrl}/issues/new?${params.toString()}`;
}
