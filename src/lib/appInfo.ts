/**
 * Who makes the app and where its public pages live - one place for the
 * About screen, and the same facts the web pages (public/about.html,
 * public/privacy.html) and Google's consent screen show.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_INFO = {
  name: "Boulder Tracker",
  /** "1.2.9" - from git at build time (scripts/app-version.mjs). */
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
  developer: "Nathan Zumbusch",
  email: "info@nathanzumbusch.de",
  homepage: "https://nathanzumbusch.de",
  siteUrl: "https://bouldertracker.nathanzumbusch.de/",
  privacyUrl: "https://bouldertracker.nathanzumbusch.de/privacy.html",
  repoUrl: "https://github.com/NZumbusch/boulder-tracker",
  /** The promoted (stable) Android build - same file the in-app updater installs. */
  apkUrl: "https://bouldertracker.nathanzumbusch.de/android/stable/boulder-tracker.apk",
  /** Where the APK's commit, checksum and signing fingerprint are explained. */
  verifyUrl: "https://bouldertracker.nathanzumbusch.de/about.html#verify",
  aboutUrl: "https://bouldertracker.nathanzumbusch.de/about.html",
} as const;
