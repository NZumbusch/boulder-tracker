/**
 * What each applied AI change was, kept so the next request can say it:
 * when it was applied, what was asked for and what changed. Device-local
 * (the log is a convenience for the next prompt, not athlete data), and the
 * last few only.
 */

export interface AiChangeEntry {
  id: string;
  /** ISO timestamp of when it was applied. */
  at: string;
  /** What the athlete asked for. */
  goal: string;
  /** The weeks the AI was allowed to change. */
  weeks: string[];
  /** One line per applied change. */
  lines: string[];
}

export const CHANGE_LOG_KEY = "bt.aiChangeLog";
export const CHANGE_LOG_MAX = 12;
const MAX_LINES = 10;
const MAX_LINE_CHARS = 140;
const MAX_GOAL_CHARS = 400;

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadChangeLog(store: Store | undefined = browserStore()): AiChangeEntry[] {
  try {
    const raw = store?.getItem(CHANGE_LOG_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((e): e is AiChangeEntry => !!e && typeof e.id === "string" && typeof e.at === "string" && Array.isArray(e.lines));
  } catch {
    return [];
  }
}

/** Adds an entry (newest last) and keeps the last `CHANGE_LOG_MAX`. Returns the saved log. */
export function appendChange(
  entry: { goal: string; weeks: string[]; lines: string[]; at?: Date },
  store: Store | undefined = browserStore(),
): AiChangeEntry[] {
  const at = (entry.at ?? new Date()).toISOString();
  const next: AiChangeEntry = {
    id: `${at}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    goal: entry.goal.trim().slice(0, MAX_GOAL_CHARS),
    weeks: entry.weeks,
    lines: entry.lines.slice(0, MAX_LINES).map((l) => l.slice(0, MAX_LINE_CHARS)),
  };
  const log = [...loadChangeLog(store), next].slice(-CHANGE_LOG_MAX);
  try {
    store?.setItem(CHANGE_LOG_KEY, JSON.stringify(log));
  } catch {
    /* storage full or blocked: the log is a convenience */
  }
  return log;
}
