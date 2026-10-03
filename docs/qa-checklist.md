# Real-device QA checklist

For the pre-launch check on real hardware. Everything below was only exercised in a desktop browser (Chrome with a phone-sized window and spoofed user agents) or by unit tests, never on a phone. Fill in **Result** (pass / fail) and **Notes** as you go; anything that fails goes into a GitHub issue with the build number from Settings → About & Help.

Devices wanted: an **iPhone** (Safari), an **Android phone** (Chrome and the installed app), ideally an Android **tablet** and a **second Android phone** for sync. Do each section on a **fresh install** (new browser profile or cleared site data; for the app: uninstall first) unless it says otherwise.

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |

## 1. Install: iPhone

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Safari install gate | Open the site in Safari, tap Get started. | Only the "Put it on your Home Screen" page, no setup questions. Steps show the Share icon. | | |
| 1.2 | Add to Home Screen | Share → Add to Home Screen → Add. Open the new icon. | Opens full screen, icon and name "Boulder Tracker" correct, no white flash that looks broken. | | |
| 1.3 | Fresh welcome in the installed app | Open from the Home Screen. | The welcome starts again (separate storage) and runs the full setup. | | |
| 1.4 | "Use it in the browser" | In Safari (not installed), choose Use it in the browser. | Normal setup follows; warning text about Safari erasing data is shown. | | |
| 1.5 | Reddit in-app browser | Post/send yourself the link, open it **inside the Reddit app** (and Instagram). | A banner "Open this in Safari", Copy link works. If it opens in Safari's own view the banner may not show: note which. | | |
| 1.6 | Chrome / Firefox on iOS | Open the site in Chrome iOS, then Firefox iOS; follow the install steps shown. | Wording matches the browser; Add to Home Screen is where the text says. | | |
| 1.7 | Offline | Airplane mode, open the installed app. | Opens and works; Plan, History, Analytics show your data. | | |
| 1.8 | Timer, screen locked | Start a session with a timer, lock the screen. | Expect **no** sound (documented limitation). Keep-screen-on setting keeps it awake. | | |
| 1.9 | Backup nudge | Log 3 sessions, open Home. | An alert "No backup yet…"; tapping it opens the share sheet to save the .json. | | |

## 2. Install: Android, browser and APK

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Android card | Open the site in Chrome on Android, finish the welcome. | Home shows "Get the Android app" with Download the APK and Or install the web app. | | |
| 2.2 | Install the web app | Tap Or install the web app. | Chrome's install dialog with 3 screenshots; installs; icon long-press shows 3 shortcuts. | | |
| 2.3 | APK link with the PWA installed | In the installed web app, tap Download the APK. | The file downloads; the app does **not** just reload itself. | | |
| 2.4 | Sideload | Open the downloaded APK. Allow installs for the browser if asked. | Play Protect may warn; More details → Install anyway works; the app installs. | | |
| 2.5 | Site install section | Open `/about.html` on the phone. | Hero, 3 screenshots, install steps, platform table, "Is this APK safe?" with commit, SHA-256 and certificate filled in. No sideways scroll. | | |
| 2.6 | Verify the APK | On a computer: `sha256sum boulder-tracker.apk`, `apksigner verify --print-certs`, `gh attestation verify boulder-tracker.apk --repo NZumbusch/boulder-tracker`. | Hash equals the site's; certificate fingerprint equals the site's; attestation verifies (builds before attestations: none). | | |
| 2.7 | Link preview | Paste the site link in Reddit/Discord/WhatsApp. | Card with title, text and the 3-phone picture. | | |
| 2.8 | Reddit in-app browser (Android) | Open the link from the Reddit app. | Either Chrome Custom Tab (installable) or the banner with Open in Chrome. | | |

## 3. First run (do on each platform)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Intro | Fresh open. | One-line title at your screen width, 3 swipeable screens with dots, "I already use…" link. | | |
| 3.2 | Setup path | Get started, answer each step: what you climb / goal, level, first weeks, units, location. | Each step clear; Skip works on the optional ones; the plan step previews sessions. | | |
| 3.3 | Starter plan | Choose "3 weeks, then an easy week", finish. | Undo toast; Plan opens on week 1 with Capacity sessions; Undo removes the blocks. | | |
| 3.4 | "Just keep track" | Repeat with goal "Just keep track". | The plan step is preselected as "I'll plan it myself"; Plan stays empty. | | |
| 3.5 | Home for a new user | After the welcome. | Get started card; no readiness ring, metrics, fatigue, progress or alerts. Today / This week visible. | | |
| 3.6 | Checklist ticks | Plan, do a session, log bodyweight, take the tour. | Each item ticks itself; the card disappears when done (or after 3 sessions, or ×). | | |
| 3.7 | Simple Home setting | Settings → Appearance → Home sections → turn off "Simple Home". | All enabled sections appear even with no data; turning on hides them again. | | |
| 3.8 | Example data | Home → "look around with example data" (and Analytics → See it with example data). | Banner "Example data, nothing saved"; Start Now refuses with a message; Exit returns to your (empty) data; reload shows no example data. | | |
| 3.9 | Tour | Home ? button, then Take the tour. | Runs through every screen; leaving restores your data. | | |
| 3.10 | Returning user: backup | New install, "I already use Boulder Tracker" → Restore a backup file. | Data comes back, no setup questions, lands on History. | | |
| 3.11 | Returning user: Drive (Android) | New install, "I already use…" → Connect Google Drive. | Google sign-in, data returns from Drive, welcome ends. | | |

## 4. Android app

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Reminder question timing | Fresh install, do the welcome. | **No** reminders dialog at first launch or during the welcome. After finishing your first session, the question appears once. | | |
| 4.2 | Update, Testing to Stable | Settings → About & Help → App updates: switch channels, Check now. | Stable shows the promoted build (or says none is promoted yet); update card shows commit and SHA-256; install works and keeps your data; a backup is written first. | | |
| 4.3 | About: build identity | Settings → About & Help. | Version, build number, commit (links to GitHub), Source code, Check this build. | | |
| 4.4 | Feedback | Settings → About & Help → Report a bug. Tick/untick the error log. | Email draft and GitHub issue open prefilled with version, build, commit, device; log only when ticked. | | |
| 4.5 | Timer, screen off | Start an interval timer, turn the screen off. | Beeps and notification continue. | | |
| 4.6 | Widgets, shortcuts | Add the Today / Readiness / Quick log widgets; long-press the app icon. | Widgets show data and open the right place; shortcuts work. | | |
| 4.7 | Health Connect | Settings → Connections → Health Connect, allow, import. | Sleep, RHR and weight appear; manual values win. | | |
| 4.8 | Back button | Open a sheet or session, press Android back. | Closes the top layer; from Home the app exits; never a blank screen. | | |

## 5. Sync, including the backup-restore fix

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Two phones | Connect Drive on phone A, log a session; connect on phone B (fresh). | B ends up with A's data; both list each other under Devices. | | |
| 5.2 | Edits both ways | Edit different things on A and B, sync both (Sync now). | Both phones end with both edits. | | |
| 5.3 | Same record, two edits | Edit the same session on both while offline, then sync both. | A "changed on two devices" toast; the losing version is restorable in Settings → Sync. | | |
| 5.4 | Offline | Airplane mode, log something, reconnect. | Syncs by itself within a minute or two of coming online. | | |
| 5.5 | Reconnect | Disconnect and connect again on A. | Same device name, no duplicates under Devices. | | |
| 5.6 | **Restored backup (new)** | Follow `docs/android-backup-audit.md` ("What a test needs"). | Phone B: toast + "Restored from a backup" note in Settings → Sync; a **different** device ID than A; A and B list each other; edits reach both ways. | | |
| 5.7 | Revoked access | Remove the app at myaccount.google.com/permissions, then open the app. | "Google needs you to sign in again" with a Sign in button that works. | | |

## 6. Look and feel

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Landscape | Rotate a phone and a tablet on Home, Plan, a session, Settings. | Readable, nothing cut off beyond scrolling, no overlap with the bottom bar. | | |
| 6.2 | Light and dark | Switch the phone's theme and the in-app theme. | Both look right; the welcome, banners and tables are legible. | | |
| 6.3 | Text size 130% | Phone font scale to 130% (and the in-app text size to large). | No clipped buttons on the welcome, Home or session screens. | | |
| 6.4 | Small phone | A 360 px-wide phone (or 320 px browser window). | Welcome title on one line; install and verify pages without sideways scroll. | | |
| 6.5 | Medical wording | Look at About, the Pain card and the AI coach. | "Not medical advice" notes present and not in the way. | | |
| 6.6 | PDF export, first use offline | Online: export a plan PDF once. Then offline: export again. | First export works online; the second works offline (libraries now cached). A first-ever export with no signal fails (known). | | |

## After the run

- Anything marked fail: note the build (Settings → About & Help) and the platform, and open an issue.
- If 2.6 or the site's verify values are wrong, don't post until fixed: the whole "check the build" claim depends on them.
- Re-run sections 1 to 3 on a clean device after the final deploy, from the public link (not a dev build).
