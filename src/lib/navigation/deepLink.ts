/**
 * `bouldertracker://` links: how the launcher shortcuts (long-press the app
 * icon) and the home-screen widget open a particular place in the app.
 *
 * - `bouldertracker://session`  - the running session, else the Start screen
 * - `bouldertracker://quicklog` - Home with the quick-log sheet open
 * - `bouldertracker://quicklog/pain` (or bodyweight, send, benchmark) - the sheet already on that form
 * - `bouldertracker://metrics`  - Home, editing today's first missing metric
 * - `bouldertracker://view/plan` (any tab) - that tab
 *
 * Parsing is pure; `lib/native/deepLinks.ts` feeds it Android's intents.
 */
import type { ViewType } from "../types";

export const DEEP_LINK_SCHEME = "bouldertracker";

export const QUICK_LOG_KINDS = ["pain", "bodyweight", "send", "benchmark"] as const;
export type QuickLogKind = (typeof QUICK_LOG_KINDS)[number];

export type DeepLink =
  | { kind: "session" }
  | { kind: "quickLog"; action?: QuickLogKind }
  | { kind: "metrics" }
  | { kind: "view"; view: ViewType };

const VIEWS: ViewType[] = ["home", "plan", "add", "history", "settings", "analytics"];

export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  if (!url) return null;
  const match = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^?#]*)/i);
  if (!match || match[1].toLowerCase() !== DEEP_LINK_SCHEME) return null;
  const [head, ...rest] = match[2].split("/").filter(Boolean).map((p) => p.toLowerCase());
  switch (head) {
    case "session":
      return { kind: "session" };
    case "quicklog": {
      const action = QUICK_LOG_KINDS.find((k) => k === rest[0]);
      return action ? { kind: "quickLog", action } : { kind: "quickLog" };
    }
    case "metrics":
      return { kind: "metrics" };
    case "view": {
      const view = rest[0] as ViewType | undefined;
      return view && VIEWS.includes(view) ? { kind: "view", view } : null;
    }
    default:
      return null;
  }
}
