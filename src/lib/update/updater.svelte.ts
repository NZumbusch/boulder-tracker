/**
 * Checking for and installing a newer build of the Android app (see
 * `appUpdate.ts`). Quietly on start and when the app comes back (at most
 * every CHECK_EVERY_MS) while "Check automatically" is on, and on "Check
 * now" in Settings. Installing always goes through Android's own installer,
 * which asks to confirm.
 */
import { App } from "@capacitor/app";
import { trainingState } from "../state.svelte";
import { AppUpdater, appUpdaterSupported } from "../native/appUpdater";
import { missingChannelMessage, parseManifest, isNewer, changesSince, apkUrl, manifestUrlFor, type UpdateManifest, type UpdateChannel } from "./appUpdate";
import { settingsPath } from "../settings/tree";

const SETTINGS_KEY = "boulder_tracker_app_updates";
const CHECK_EVERY_MS = 6 * 3_600_000;

interface Settings {
  auto: boolean;
  channel: UpdateChannel;
  lastCheckedAt: number | null;
  /** The build whose "Update available" card was closed - it stays out of the way until a newer one. */
  dismissedCode: number | null;
}

function loadSettings(): Settings {
  const fallback: Settings = { auto: true, channel: "stable", lastCheckedAt: null, dismissedCode: null };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    // Settings saved before channels existed came from a build installed
    // off the testing channel (the only one there was) - stay on it.
    if (raw) return { ...fallback, channel: "testing", ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return fallback;
}

class Updater {
  supported = appUpdaterSupported();
  /** The installed build. */
  installedCode = $state<number | null>(null);
  installedName = $state<string | null>(null);
  auto = $state(true);
  channel = $state<UpdateChannel>("stable");
  /** The channel's newest build, even when it isn't newer than this one - for the "ahead of stable" message. */
  latestOnChannel = $state<UpdateManifest | null>(null);
  lastCheckedAt = $state<number | null>(null);
  dismissedCode = $state<number | null>(null);
  /** The published build, when it's newer than this one. */
  available = $state<UpdateManifest | null>(null);
  status = $state<"idle" | "checking" | "backing-up" | "downloading" | "installing">("idle");
  progress = $state(0);
  error = $state<string | null>(null);
  /** After "Check now" found nothing. */
  upToDate = $state(false);
  /** Where the safety backup before this update went. */
  backedUpTo = $state<string | null>(null);
  /** The safety backup failed; the next Install goes ahead without one. */
  #skipBackup = false;

  #started = false;
  /** The build already downloaded and checked - "Install" again (after allowing installs) doesn't fetch it twice. */
  #downloadedCode: number | null = null;

  /** What's new since the installed build. */
  get changes(): string[] {
    return this.available && this.installedCode !== null ? changesSince(this.available, this.installedCode) : [];
  }

  /** Show the Home card: an update, not closed for this build. */
  get showBanner(): boolean {
    return !!this.available && this.available.versionCode !== this.dismissedCode;
  }

  async init(): Promise<void> {
    if (!this.supported || this.#started) return;
    this.#started = true;
    const s = loadSettings();
    this.auto = s.auto;
    this.channel = s.channel;
    this.lastCheckedAt = s.lastCheckedAt;
    this.dismissedCode = s.dismissedCode;
    try {
      const info = await App.getInfo();
      this.installedCode = Number.parseInt(info.build, 10) || null;
      this.installedName = info.version;
    } catch { /* leave unknown - nothing is offered then */ }
    if (this.auto) void this.check();
    void App.addListener("resume", () => {
      if (this.auto && Date.now() - (this.lastCheckedAt ?? 0) > CHECK_EVERY_MS) void this.check();
    });
  }

  #save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ auto: this.auto, channel: this.channel, lastCheckedAt: this.lastCheckedAt, dismissedCode: this.dismissedCode } satisfies Settings));
    } catch { /* not critical */ }
  }

  setAuto(on: boolean) {
    this.auto = on;
    this.#save();
    if (on) void this.check();
  }

  /** Switches channel and checks it straight away. */
  setChannel(channel: UpdateChannel) {
    if (channel === this.channel) return;
    this.channel = channel;
    this.available = null;
    this.latestOnChannel = null;
    this.#save();
    void this.check(true);
  }

  /** This build is newer than anything on the chosen channel (a test build, now on Stable). */
  get aheadOfChannel(): boolean {
    return !!this.latestOnChannel && this.installedCode !== null && this.installedCode > this.latestOnChannel.versionCode;
  }

  dismiss() {
    if (!this.available) return;
    this.dismissedCode = this.available.versionCode;
    this.#save();
  }

  /** Looks for a newer build. `manual` reports "up to date" and errors; a quiet check stays quiet. */
  async check(manual = false): Promise<void> {
    if (!this.supported || this.status !== "idle" || this.installedCode === null) return;
    this.status = "checking";
    this.error = null;
    this.upToDate = false;
    try {
      const response = await fetch(`${manifestUrlFor(this.channel)}?t=${Date.now()}`, { cache: "no-store" });
      if (response.status === 404) {
        // Nothing has been promoted to stable yet (or testing is mid-deploy).
        this.latestOnChannel = null;
        this.available = null;
        this.lastCheckedAt = Date.now();
        this.#save();
        if (manual) this.error = missingChannelMessage(this.channel);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = parseManifest(await response.json());
      if (!manifest) throw new Error("The version file looks wrong");
      this.lastCheckedAt = Date.now();
      this.#save();
      this.latestOnChannel = manifest;
      this.available = isNewer(manifest, this.installedCode) ? manifest : null;
      this.upToDate = manual && !this.available && !this.aheadOfChannel;
    } catch (e) {
      if (manual) this.error = `Couldn't check for updates (${e instanceof Error ? e.message : String(e)}).`;
    } finally {
      this.status = "idle";
    }
  }

  /** Downloads the update (checked against its SHA-256) and opens Android's installer. */
  async install(): Promise<void> {
    const manifest = this.available;
    if (!manifest || this.status !== "idle") return;
    const url = apkUrl(manifest, manifestUrlFor(this.channel));
    if (!url) {
      this.error = "The update's download address isn't secure - not installing it.";
      return;
    }
    this.error = null;
    // A safety backup first - the same file the weekly automatic backup
    // writes to Documents/BoulderTracker, outside the app. An update keeps
    // the app's data anyway; this is for a new version that turns out bad.
    if (!this.#skipBackup) {
      this.status = "backing-up";
      try {
        this.backedUpTo = await trainingState.backupStore.writeBackupNow();
      } catch (e) {
        this.status = "idle";
        this.#skipBackup = true;
        this.error = `Couldn't write a safety backup first (${e instanceof Error ? e.message : String(e)}). Export one in ${settingsPath('sync')}, or tap Install again to update anyway.`;
        return;
      }
    }
    this.status = "downloading";
    this.progress = 0;
    const listener = await AppUpdater.addListener("progress", (e) => { this.progress = e.fraction; });
    try {
      if (this.#downloadedCode !== manifest.versionCode) {
        await AppUpdater.download({ url, sha256: manifest.sha256 });
        this.#downloadedCode = manifest.versionCode;
      }
      this.progress = 1;
      this.status = "installing";
      const { status } = await AppUpdater.install();
      if (status === "needs-permission") {
        this.error = "Allow Boulder Tracker to install updates in the screen that just opened, then tap Install again.";
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      await listener.remove();
      this.status = "idle";
    }
  }
}

export const updater = new Updater();
