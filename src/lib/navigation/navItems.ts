import type { ViewType } from "../types";

/*
 * What the navigation offers, in one place: the drawer, the side rail and the
 * old bottom bar all read these lists. Pure, so what shows when is testable.
 */

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  view: ViewType;
}

/** The five destinations, in the order the bottom bar had them. */
export const MAIN_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: "ic:baseline-home", view: "home" },
  { id: "plan", label: "Plan", icon: "ic:baseline-calendar-month", view: "plan" },
  { id: "add", label: "Log a workout", icon: "ic:baseline-plus", view: "add" },
  { id: "history", label: "History", icon: "ic:baseline-history", view: "history" },
  { id: "analytics", label: "Analytics", icon: "ic:baseline-show-chart", view: "analytics" },
];

export const SETTINGS_ITEM: NavItem = { id: "settings", label: "Settings", icon: "ic:baseline-settings", view: "settings" };

/** A row of the drawer: a destination, or an action (resume the session, take the tour, look at sync). */
export type DrawerRow =
  | { kind: "view"; id: string; label: string; icon: string; view: ViewType }
  | { kind: "action"; id: "resume" | "tour" | "sync"; label: string; icon: string };

export function drawerRows(state: { sessionRunning: boolean; syncError: boolean }): DrawerRow[] {
  const rows: DrawerRow[] = [];
  if (state.sessionRunning) rows.push({ kind: "action", id: "resume", label: "Resume session", icon: "ic:baseline-play-circle" });
  rows.push(...MAIN_ITEMS.map((i): DrawerRow => ({ kind: "view", ...i })));
  rows.push({ kind: "view", ...SETTINGS_ITEM });
  if (state.syncError) rows.push({ kind: "action", id: "sync", label: "Sync needs attention", icon: "ic:baseline-sync-problem" });
  rows.push({ kind: "action", id: "tour", label: "Take the tour", icon: "ic:outline-help-outline" });
  return rows;
}

export type FabAction = "log" | "add-to-plan";

/**
 * What the floating + does on a screen, or null for none: log a workout from
 * the overview screens, add a session on the selected day on Plan. Not on
 * Log itself, in Settings, in an editor, or while a session is running (its
 * bubble takes the corner).
 */
export function fabFor(view: ViewType, state: { sessionRunning: boolean; inEditor: boolean }): FabAction | null {
  if (state.sessionRunning || state.inEditor) return null;
  if (view === "add" || view === "settings") return null;
  return view === "plan" ? "add-to-plan" : "log";
}

/** The top bar's first button: the menu on a main screen, back on a nested page (Android's rule). */
export function appBarBack(state: { nested: boolean }): "menu" | "back" {
  return state.nested ? "back" : "menu";
}

/**
 * What the menu button (or, with the bottom bar, the Settings button) should hint at: sync needs attention, or a session
 * is running with its way back only in the drawer. Sync wins - it is the one that is not visible anywhere else.
 */
export function menuBadge(state: { sessionRunning: boolean; syncError: boolean }): "sync" | "session" | null {
  return state.syncError ? "sync" : state.sessionRunning ? "session" : null;
}
