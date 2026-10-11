import { incrementWeekId } from "../dateUtils";

/**
 * One-tap starting points for "Change plan": what to ask and which weeks the
 * AI may change, so the usual requests aren't retyped. The goal text is the
 * athlete's to edit afterwards; a few ask them to fill a bracket.
 */

export type WeekSpan = "thisWeek" | "thisAndNext" | "nextWeek" | "nextTwo";

export interface QuickAdapt {
  id: string;
  label: string;
  goal: string;
  span: WeekSpan;
}

export const QUICK_ADAPTS: QuickAdapt[] = [
  {
    id: "checkin",
    label: "Weekly check-in",
    span: "nextWeek",
    goal: 'Weekly check-in: look at how the last weeks went against their plans (see "Since the plan was last changed"), then plan next week. Keep what is working, fix what was not, and say why in the week note.',
  },
  {
    id: "missed",
    label: "Missed sessions",
    span: "thisWeek",
    goal: "I missed sessions this week. Re-plan the rest of this week so the key sessions still happen without stacking hard days, and do not try to make up the lost load.",
  },
  {
    id: "tired",
    label: "Tired or sore",
    span: "thisAndNext",
    goal: "I am more tired or sore than the plan assumed. Lighten the next days, keep the one or two sessions that matter most and make sure there is a proper rest day.",
  },
  {
    id: "strong",
    label: "Felt strong",
    span: "nextTwo",
    goal: "Sessions felt easy and I am recovering well. Progress the next two weeks a little - small steps, not a jump.",
  },
  {
    id: "away",
    label: "Travelling",
    span: "thisAndNext",
    goal: "I am away from [day] to [day] with limited equipment ([what is available]). Plan around it and keep the key work.",
  },
  {
    id: "ill",
    label: "Ill or injured",
    span: "thisAndNext",
    goal: "I have been ill or injured ([what]). Ease me back in gradually and drop anything that loads it.",
  },
];

/** The weeks a span covers, starting from the running week. */
export function spanWeeks(span: WeekSpan, currentWeekId: string): { start: string; end: string } {
  const next = incrementWeekId(currentWeekId);
  switch (span) {
    case "thisWeek": return { start: currentWeekId, end: currentWeekId };
    case "thisAndNext": return { start: currentWeekId, end: next };
    case "nextWeek": return { start: next, end: next };
    case "nextTwo": return { start: next, end: incrementWeekId(next) };
  }
}

/** The goal after tapping a chip: empty stays empty-then-chip, text already typed keeps going on a new line. */
export function withGoal(existing: string, chipGoal: string): string {
  const typed = existing.trim();
  if (!typed || typed === chipGoal) return chipGoal;
  return `${typed}\n${chipGoal}`;
}

export const LAST_REQUEST_KEY = "bt.aiLastRequest";

export interface LastRequest { goal: string; start: string; end: string }

type Store = Pick<Storage, "getItem" | "setItem">;
function browserStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadLastRequest(store: Store | undefined = browserStore()): LastRequest | undefined {
  try {
    const raw = store?.getItem(LAST_REQUEST_KEY);
    const v = raw ? JSON.parse(raw) : undefined;
    return v && typeof v.goal === "string" && typeof v.start === "string" && typeof v.end === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function saveLastRequest(req: LastRequest, store: Store | undefined = browserStore()): void {
  if (!req.goal.trim()) return;
  try {
    store?.setItem(LAST_REQUEST_KEY, JSON.stringify(req));
  } catch {
    /* a convenience only */
  }
}
