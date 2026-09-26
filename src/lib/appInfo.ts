/**
 * Who makes the app and where its public pages live - one place for the
 * About screen, and the same facts the web pages (public/about.html,
 * public/privacy.html) and Google's consent screen show.
 */
export const APP_INFO = {
  name: "Boulder Tracker",
  version: "1.0.0",
  developer: "Nathan Zumbusch",
  email: "info@nathanzumbusch.de",
  homepage: "https://nathanzumbusch.de",
  siteUrl: "https://bouldertracker.nathanzumbusch.de/",
  privacyUrl: "https://bouldertracker.nathanzumbusch.de/privacy.html",
  aboutUrl: "https://bouldertracker.nathanzumbusch.de/about.html",
} as const;
