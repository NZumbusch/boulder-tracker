import { APP_INFO } from "../appInfo";

/**
 * Self-updates for the sideloaded Android app. CI builds a signed APK on
 * every push to main and publishes it with this version file next to the
 * web app on GitHub Pages (scripts/write-update-manifest.mjs). The app reads
 * the file, compares build numbers, and installs through the AppUpdater
 * plugin. This module is the pure part: reading the file and deciding.
 */

/** Where CI publishes the version file (same site as the web app). */
export const UPDATE_MANIFEST_URL = `${APP_INFO.siteUrl}android/version.json`;

export interface UpdateChange {
  /** The build number this change first shipped in. */
  versionCode: number;
  subject: string;
}

export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  /** The APK, relative to the version file. */
  apk: string;
  /** Hex SHA-256 of the APK - the download is checked against it. */
  sha256: string;
  size?: number;
  publishedAt?: string;
  /** Recent commits, newest first - "what's new" is the ones newer than the installed build. */
  changes: UpdateChange[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The version file, or `null` if it isn't one - never throws. */
export function parseManifest(raw: unknown): UpdateManifest | null {
  if (!isObj(raw)) return null;
  const { versionCode, versionName, apk, sha256 } = raw;
  if (typeof versionCode !== "number" || !Number.isInteger(versionCode) || versionCode < 1) return null;
  if (typeof apk !== "string" || !apk || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256)) return null;
  const changes = Array.isArray(raw.changes)
    ? raw.changes.filter((c): c is UpdateChange => isObj(c) && typeof c.versionCode === "number" && typeof c.subject === "string")
    : [];
  return {
    versionCode,
    versionName: typeof versionName === "string" ? versionName : String(versionCode),
    apk,
    sha256: sha256.toLowerCase(),
    ...(typeof raw.size === "number" ? { size: raw.size } : {}),
    ...(typeof raw.publishedAt === "string" ? { publishedAt: raw.publishedAt } : {}),
    changes,
  };
}

export function isNewer(manifest: UpdateManifest, installedCode: number): boolean {
  return manifest.versionCode > installedCode;
}

/** What's new since the installed build, newest first. */
export function changesSince(manifest: UpdateManifest, installedCode: number, limit = 8): string[] {
  return manifest.changes.filter((c) => c.versionCode > installedCode).slice(0, limit).map((c) => c.subject);
}

/** The APK's absolute URL - only https, since the plugin refuses anything else. */
export function apkUrl(manifest: UpdateManifest, manifestUrl: string = UPDATE_MANIFEST_URL): string | null {
  try {
    const url = new URL(manifest.apk, manifestUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** "12.3 MB" */
export function formatSize(bytes: number | undefined): string | undefined {
  if (!bytes) return undefined;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
