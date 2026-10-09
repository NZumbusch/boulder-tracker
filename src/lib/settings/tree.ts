/**
 * The shape of Settings: a handful of sections, each a list of pages (a
 * section with a single page opens it directly). One place that knows the
 * names, so the screens, the search and every "Settings → …" mentioned in
 * the app's own text agree - rename a page here and they all follow.
 */
export type SectionId = "setup" | "display" | "sessions" | "health" | "reminders" | "ai" | "data" | "about";

export type PageId =
  | "exercises" | "circuits" | "phases" | "benchmarks" | "values"
  | "general" | "units" | "home" | "history"
  | "live" | "timer"
  | "model" | "pain" | "weather"
  | "reminders"
  | "coach" | "aiSharing"
  | "sync" | "healthConnect" | "exports" | "widgets"
  | "about";

/** What the running app can offer; pages that need more are left out of the lists. */
export interface SettingsContext {
  /** The Android app (not the browser). */
  native: boolean;
  /** Home-screen widgets can be added (Android). */
  widgets: boolean;
  /** Health Connect is available on this device. */
  healthConnect: boolean;
}

export interface SettingsPage {
  id: PageId;
  label: string;
  hint: string;
  icon: string;
  /** Needs the capability of the same name in the context. */
  needs?: keyof SettingsContext;
}

export interface SettingsSection {
  id: SectionId;
  label: string;
  hint: string;
  icon: string;
  pages: SettingsPage[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "setup",
    label: "Training setup",
    hint: "Exercises, circuits, phases, benchmark tests, value types",
    icon: "ic:baseline-tune",
    pages: [
      { id: "exercises", label: "Exercises & categories", hint: "Your exercise library and the analytics categories", icon: "ic:baseline-fitness-center" },
      { id: "circuits", label: "Circuits", hint: "Saved circuits and supersets", icon: "ic:baseline-loop" },
      { id: "phases", label: "Phases & templates", hint: "Training phases and the sessions each one starts with", icon: "ic:baseline-calendar-month" },
      { id: "benchmarks", label: "Benchmark tests", hint: "Max hang, pull-ups, holds - what each records, and how", icon: "ic:baseline-bar-chart" },
      { id: "values", label: "Value types", hint: "Weight, reps, time, edge depth or your own - used by exercises and benchmark tests", icon: "ic:baseline-tune" },
    ],
  },
  {
    id: "display",
    label: "App & display",
    hint: "Theme, units, Home, history and analytics",
    icon: "ic:baseline-color-lens",
    pages: [
      { id: "general", label: "Look & feel", hint: "Theme, text size, bottom bar, help buttons, motion", icon: "ic:baseline-palette" },
      { id: "units", label: "Units", hint: "Weight, temperature, grades, speed", icon: "ic:baseline-straighten" },
      { id: "home", label: "Home", hint: "Which cards show and in what order, quick log, list lengths", icon: "ic:baseline-home" },
      { id: "history", label: "History & Analytics", hint: "Analytics cards, recovery chart, sends chart", icon: "ic:baseline-bar-chart" },
    ],
  },
  {
    id: "sessions",
    label: "Sessions & timer",
    hint: "Live sessions, timer, sounds and voice",
    icon: "ic:baseline-timer",
    pages: [
      { id: "live", label: "Live sessions", hint: "Added exercises, screen, notification, haptics", icon: "ic:baseline-play-circle-outline" },
      { id: "timer", label: "Timer, sound & voice", hint: "Countdown warnings, beep style and volume, spoken exercises", icon: "ic:baseline-timer" },
    ],
  },
  {
    id: "health",
    label: "Model & health",
    hint: "Readiness model, pain check-ins, weather and outdoor",
    icon: "ic:baseline-healing",
    pages: [
      { id: "model", label: "Training model", hint: "Readiness, ACWR zones, fatigue recovery, rest-day alert", icon: "ic:baseline-tune" },
      { id: "pain", label: "Pain check-ins", hint: "Home, after sessions, reminder, when to ask to close", icon: "ic:baseline-healing" },
      { id: "weather", label: "Weather & outdoor", hint: "Locations, crags, conditions, trips", icon: "ic:baseline-cloud" },
    ],
  },
  {
    id: "reminders",
    label: "Reminders & nudges",
    hint: "Notifications and the nudges Home gives",
    icon: "ic:baseline-notifications",
    pages: [{ id: "reminders", label: "Reminders & nudges", hint: "Notifications, retest and backup nudges", icon: "ic:baseline-notifications" }],
  },
  {
    id: "ai",
    label: "AI & coach",
    hint: "What the coach remembers and what it sees",
    icon: "ic:baseline-psychology",
    pages: [
      { id: "coach", label: "Coach notes", hint: "About me, standing goal and what the coach remembers", icon: "ic:baseline-psychology" },
      { id: "aiSharing", label: "What the AI sees", hint: "What goes into the prompts, and how far back", icon: "ic:baseline-visibility" },
    ],
  },
  {
    id: "data",
    label: "Data & connections",
    hint: "Sync, backup, Health Connect, exports, widgets",
    icon: "ic:baseline-cloud-sync",
    pages: [
      { id: "sync", label: "Sync & backup", hint: "Google Drive sync, backups, settings file, start over", icon: "ic:baseline-cloud-sync" },
      { id: "healthConnect", label: "Health Connect", hint: "Resting heart rate, weight and sleep from your watch", icon: "ic:baseline-monitor-heart", needs: "healthConnect" },
      { id: "exports", label: "Calendar & PDF", hint: "Your plan in your calendar, a printable PDF", icon: "ic:baseline-swap-horiz" },
      { id: "widgets", label: "Widgets", hint: "Today, readiness, this week and quick log for the home screen", icon: "ic:baseline-widgets", needs: "widgets" },
    ],
  },
  {
    id: "about",
    label: "About & Help",
    hint: "Tour, install on iPhone, contact, privacy policy",
    icon: "ic:baseline-info",
    pages: [{ id: "about", label: "About & Help", hint: "Tour, install on iPhone, contact, privacy policy", icon: "ic:baseline-info" }],
  },
];

/** A page and the section it is in. */
export function findPage(id: PageId): { section: SettingsSection; page: SettingsPage } {
  for (const section of SETTINGS_SECTIONS) {
    const page = section.pages.find((p) => p.id === id);
    if (page) return { section, page };
  }
  throw new Error(`Unknown settings page: ${id}`);
}

export const findSection = (id: SectionId): SettingsSection => SETTINGS_SECTIONS.find((s) => s.id === id)!;

/** The pages of a section that this device can show. */
export function visiblePages(section: SettingsSection, ctx: SettingsContext): SettingsPage[] {
  return section.pages.filter((p) => !p.needs || ctx[p.needs]);
}

/** The sections with something to show here. */
export function visibleSections(ctx: SettingsContext): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => visiblePages(s, ctx).length > 0);
}

/**
 * "Settings → App & display → Units" - how the app's own text points at a
 * page. A section with a single page is named once.
 */
export function settingsPath(id: PageId): string {
  const { section, page } = findPage(id);
  return section.pages.length === 1 ? `Settings → ${section.label}` : `Settings → ${section.label} → ${page.label}`;
}

// --- Search ----------------------------------------------------------------

/** A setting (or a group of them) people look for by name; `page` is where it lives. */
interface SearchEntry {
  label: string;
  page: PageId;
  /** Other words for it. */
  words?: string;
}

const SEARCH_ENTRIES: SearchEntry[] = [
  { label: "Theme", page: "general", words: "dark light contrast colours" },
  { label: "Text size", page: "general", words: "font large small" },
  { label: "Bottom bar labels", page: "general", words: "navigation tabs icons" },
  { label: "Help buttons", page: "general", words: "question mark explain" },
  { label: "Motion", page: "general", words: "animations reduced" },
  { label: "Weight, temperature and grade units", page: "units", words: "kg lb celsius fahrenheit font v-scale" },
  { label: "Home cards and order", page: "home", words: "sections reorder hide simple" },
  { label: "Quick log (+) actions", page: "home", words: "pain bodyweight send benchmark" },
  { label: "Recent activity and benchmark list lengths", page: "home" },
  { label: "Analytics cards", page: "history", words: "reorder hide charts" },
  { label: "Recovery chart", page: "history", words: "hrv sleep resting heart rate lanes" },
  { label: "Sends by grade chart", page: "history", words: "counts" },
  { label: "Added exercises count as", page: "live", words: "extra planned mid-session adherence" },
  { label: "Keep screen on during a session", page: "live", words: "wake lock awake" },
  { label: "Session notification", page: "live", words: "pause resume clock" },
  { label: "Haptic feedback", page: "live", words: "vibration buzz" },
  { label: "3-2-1 countdown", page: "timer", words: "beeps ticks" },
  { label: "15 second warning", page: "timer", words: "heads-up rest" },
  { label: "Timer in the background", page: "timer", words: "notification locked screen alarms" },
  { label: "Keep screen on while a timer runs", page: "timer" },
  { label: "How much the timer speaks up", page: "timer", words: "quiet silent loudness audio level podcast audiobook music duck pause mute announcements" },
  { label: "Beep sound style", page: "timer", words: "classic soft sharp chime tone" },
  { label: "Cue volume", page: "timer", words: "loud quiet media volume" },
  { label: "Vibrate with the cues", page: "timer" },
  { label: "Speak the exercises", page: "timer", words: "voice tts announce text to speech next up" },
  { label: "Speech engine, voice, speed and pitch", page: "timer", words: "tts language" },
  { label: "Readiness score", page: "model", words: "acwr fatigue zones thresholds" },
  { label: "Fatigue recovery and rest-day alert", page: "model", words: "decay soften" },
  { label: "Pain check-ins", page: "pain", words: "still there gone better worse" },
  { label: "Pain reminder notification", page: "pain", words: "reminders" },
  { label: "Weather locations and crags", page: "weather", words: "home location conditions" },
  { label: "Ideal temperature and rain", page: "weather", words: "friction trips outdoor" },
  { label: "Allow notifications", page: "reminders", words: "permission" },
  { label: "Daily metrics reminder", page: "reminders", words: "bodyweight sleep" },
  { label: "Plan B reminder", page: "reminders", words: "uncertain days" },
  { label: "Retest nudge", page: "reminders", words: "benchmark weeks" },
  { label: "Backup reminder", page: "reminders", words: "days" },
  { label: "About me and standing goal", page: "coach", words: "memory ai height injuries" },
  { label: "What the AI sees", page: "aiSharing", words: "sharing privacy prompt history weeks" },
  { label: "Google Drive sync", page: "sync", words: "devices conflict" },
  { label: "Backup and restore", page: "sync", words: "export import file json" },
  { label: "Export or import settings", page: "sync", words: "transfer file" },
  { label: "Start over", page: "sync", words: "erase delete reset wipe" },
  { label: "Health Connect import", page: "healthConnect", words: "garmin watch rhr sleep weight" },
  { label: "Calendar file", page: "exports", words: "ics google calendar" },
  { label: "Printable plan PDF", page: "exports" },
  { label: "Benchmark fields and presets", page: "benchmarks", words: "max hang edge reps weight time condition result test" },
  { label: "Value types", page: "values", words: "custom units measure weight reps time" },
  { label: "Home-screen widgets", page: "widgets" },
  { label: "App updates and build", page: "about", words: "version check now" },
  { label: "Take the tour", page: "about", words: "help install iphone" },
  { label: "Feedback and bug reports", page: "about", words: "contact error log" },
  { label: "Privacy policy", page: "about", words: "safety medical" },
];

export interface SearchHit {
  /** What matched: a setting, or a page by its own name. */
  label: string;
  page: PageId;
}

const SEARCH_PAGE_LABELS = new Set(SETTINGS_SECTIONS.flatMap((s) => s.pages.map((p) => p.label)));

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ");

/**
 * Settings and pages whose name, hint or alternative words contain every
 * word typed. Pages this device can't show are left out. Names first.
 */
export function searchSettings(query: string, ctx: SettingsContext): SearchHit[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const shown = new Set(visibleSections(ctx).flatMap((s) => visiblePages(s, ctx).map((p) => p.id)));
  const hits: { hit: SearchHit; score: number }[] = [];
  const consider = (label: string, page: PageId, haystack: string, isPage: boolean) => {
    if (!shown.has(page)) return;
    const text = norm(`${label} ${haystack}`);
    if (!words.every((w) => text.includes(w))) return;
    const inLabel = words.every((w) => norm(label).includes(w));
    hits.push({ hit: { label, page }, score: (inLabel ? 0 : 2) + (isPage ? 1 : 0) });
  };
  for (const section of SETTINGS_SECTIONS) {
    for (const page of section.pages) consider(page.label, page.id, `${page.hint} ${section.label}`, true);
  }
  for (const e of SEARCH_ENTRIES) consider(e.label, e.page, `${e.words ?? ""} ${findPage(e.page).page.label}`, false);
  // A page whose only match is its hint adds nothing when a setting on it already matched.
  const settingPages = new Set(hits.filter((h) => h.score < 3 && !SEARCH_PAGE_LABELS.has(h.hit.label)).map((h) => h.hit.page));
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (SEARCH_PAGE_LABELS.has(h.hit.label) && h.score >= 3 && settingPages.has(h.hit.page)) hits.splice(i, 1);
  }
  hits.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  return hits.map((h) => h.hit).filter((h) => (seen.has(`${h.page}:${h.label}`) ? false : (seen.add(`${h.page}:${h.label}`), true))).slice(0, 12);
}
