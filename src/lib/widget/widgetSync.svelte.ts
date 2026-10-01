/**
 * Keeps the home-screen widgets (`plugins/home-widget`) up to date: the
 * snapshot is rebuilt whenever what it shows changes - sessions, metrics,
 * the running session - and handed to Android a moment later, and again
 * when the app goes to the background. Android only; a no-op elsewhere.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { untrack } from "svelte";
import { trainingState } from "../state.svelte";
import { HomeData } from "../../components/dashboard/home/homeData.svelte";
import { getWeekId } from "../dateUtils";
import { acwrZoneOf, buildWidgetSnapshot, localIsoDate, sessionName, WIDGET_DAYS, type WidgetSnapshot, type WidgetWeek } from "./widgetSnapshot";
import { weekDayStrip } from "../planning/weekStatus";
import { buildWeekRecap, planProgress } from "../planning/weekRecap";
import { decrementWeekId } from "../dateUtils";
import type { DayOfWeek } from "../types";

interface HomeWidgetPlugin {
  update(options: { snapshot: string }): Promise<void>;
  pin(options: { kind: WidgetKind }): Promise<{ requested: boolean }>;
}
export type WidgetKind = "today" | "readiness" | "week" | "quicklog" | "load";
const HomeWidget = registerPlugin<HomeWidgetPlugin>("HomeWidget");

const DAY_NAMES: DayOfWeek[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SEND_DELAY_MS = 1500;

/** This week as Home's "This Week" card has it - the strip, the rated load, plan progress and ACWR. */
function currentWeek(now: Date, home: HomeData): WidgetWeek {
  const weekId = trainingState.currentWeekId;
  const workouts = trainingState.getWorkoutsForWeek(weekId);
  const recap = buildWeekRecap({
    weekId,
    workouts,
    prevWorkouts: trainingState.getWorkoutsForWeek(decrementWeekId(weekId)),
    ascents: [],
    painLogs: [],
    exerciseTypes: trainingState.exerciseTypes,
    analyticsCategories: trainingState.analyticsCategories,
    asOf: now,
  });
  const acwr = home.acwr;
  const progress = planProgress(workouts);
  return {
    strip: weekDayStrip(workouts, DAY_NAMES[now.getDay()]).map((c) => ({ status: c.status, ...(c.isToday ? { today: true as const } : {}) })),
    load: Math.round(recap.load),
    done: recap.done,
    planned: recap.planned,
    progress: progress === undefined ? null : Math.round(progress * 100) / 100,
    acwr: acwr.sufficient && acwr.ratio !== undefined ? { ratio: Math.round(acwr.ratio * 100) / 100, zone: acwrZoneOf(acwr.ratio, trainingState.acwrZones) } : null,
  };
}

function currentSnapshot(): WidgetSnapshot {
  const now = new Date();
  const home = new HomeData();
  const completed = trainingState.completedWorkouts;
  const days = Array.from({ length: WIDGET_DAYS }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const date = localIsoDate(day);
    return {
      date,
      planned: trainingState.getPlannedWorkoutsForWeek(getWeekId(day)).filter((w) => w.dayOfWeek === DAY_NAMES[day.getDay()]),
      done: completed.filter((w) => w.date && localIsoDate(new Date(w.date)) === date).length,
    };
  });
  const store = trainingState.sessionStore;
  const workout = store.workout;
  return buildWidgetSnapshot({
    now,
    readiness: trainingState.isLoading ? null : home.readiness,
    days,
    exerciseTypes: trainingState.exerciseTypes,
    week: trainingState.isLoading ? undefined : currentWeek(now, home),
    quickLog: trainingState.quickLogActions.filter((a) => a.visible).map((a) => a.id),
    hideReadiness: !trainingState.widgetShowReadiness,
    active: workout
      // The clock is read untracked: it ticks every second, and the widget runs its own.
      ? { name: sessionName(workout), settled: store.progress.settled, total: store.progress.total, paused: store.isPaused, elapsedMs: untrack(() => store.elapsedMs) }
      : null,
  });
}

export const widgetsAvailable = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** Asks the launcher to put a widget on the home screen; false if it can't (older Android, some launchers). */
export async function pinWidget(kind: WidgetKind): Promise<boolean> {
  try {
    return (await HomeWidget.pin({ kind })).requested;
  } catch {
    return false;
  }
}

let started = false;

export function startWidgetSync(): void {
  if (started || !widgetsAvailable()) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The latest snapshot, what was last sent, and the latest minus its timestamps (to tell real changes). */
  let latest = "";
  let sent = "";
  let latestKey = "";
  const send = () => {
    clearTimeout(timer);
    if (!latest || latest === sent) return;
    sent = latest;
    void HomeWidget.update({ snapshot: latest }).catch(() => {});
  };

  $effect.root(() => {
    $effect(() => {
      if (trainingState.isLoading || trainingState.demoActive) return;
      const snap = currentSnapshot();
      const key = JSON.stringify({ ...snap, updatedAt: 0, active: snap.active && { ...snap.active, elapsedMs: 0 } });
      if (key === latestKey) return;
      latestKey = key;
      latest = JSON.stringify(snap);
      clearTimeout(timer);
      timer = setTimeout(send, SEND_DELAY_MS);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || trainingState.demoActive) return;
    // Fresh numbers on the way out (the session clock, today's date).
    latest = JSON.stringify(currentSnapshot());
    sent = "";
    send();
  });
}
