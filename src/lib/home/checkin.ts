import { getWeekId } from "../dateUtils";

/**
 * The weekly check-in: from the chosen weekday to the end of the week, Home
 * offers "review the week and plan the next" until it's been done (or put
 * off) for that week. The day is a setting (1 = Monday ... 7 = Sunday, 0 =
 * off); what's been done is remembered on this device.
 */

export const CHECKIN_DONE_KEY = "bt.checkinDone";

/** Whether the card is due: on or after the check-in day within the running week, and not yet done for it. */
export function checkinDue(asOf: Date, day: number, doneWeekId: string | undefined, hasSessions: boolean): boolean {
  if (!hasSessions || day < 1 || day > 7) return false;
  if (doneWeekId === getWeekId(asOf)) return false;
  const todayIso = ((asOf.getDay() + 6) % 7) + 1; // Monday = 1 ... Sunday = 7
  return todayIso >= day;
}

type Store = Pick<Storage, "getItem" | "setItem">;
function browserStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function loadCheckinDone(store: Store | undefined = browserStore()): string | undefined {
  try {
    return store?.getItem(CHECKIN_DONE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function markCheckinDone(weekId: string, store: Store | undefined = browserStore()): void {
  try {
    store?.setItem(CHECKIN_DONE_KEY, weekId);
  } catch {
    /* it just shows again */
  }
}
