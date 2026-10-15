# Real-device QA checklist

For the pre-launch check on real hardware. Everything below was only exercised in a desktop browser (Chrome with a phone-sized window and spoofed user agents) or by unit tests, never on a phone. Fill in **Result** (pass / fail) and **Notes** as the run goes; anything that fails goes into a GitHub issue with the build number from Settings → About & Help.

Devices wanted: an **iPhone** (Safari), an **Android phone** (Chrome and the installed app), ideally an Android **tablet** and a **second Android phone** for sync. Do each section on a **fresh install** (new browser profile or cleared site data; for the app: uninstall first) unless it says otherwise.

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
| 3.7 | Simple Home setting | Settings → App & display → Home → turn off "Simple Home". | All enabled sections appear even with no data; turning on hides them again. | | |
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
| 5.3 | Same record, two edits | Edit the same session on both while offline, then sync both. | A "changed on two devices" toast; the losing version is restorable in Settings → Data & connections → Sync & backup. | | |
| 5.4 | Offline | Airplane mode, log something, reconnect. | Syncs by itself within a minute or two of coming online. | | |
| 5.5 | Reconnect | Disconnect and connect again on A. | Same device name, no duplicates under Devices. | | |
| 5.6 | **Restored backup (new)** | Follow `docs/android-backup-audit.md` ("What a test needs"). | Phone B: toast + "Restored from a backup" note in Settings → Data & connections → Sync & backup; a **different** device ID than A; A and B list each other; edits reach both ways. | | |
| 5.7 | Revoked access | Remove the app at myaccount.google.com/permissions, then open the app. | "Google needs you to sign in again" with a Sign in button that works. | | |

## 6. Look and feel

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Landscape | Rotate a phone and a tablet on Home, Plan, a session, Settings. | Readable, nothing cut off beyond scrolling, no overlap with the bottom bar or the floating +; on a phone on its side the rail is on the left. | | |
| 6.2 | Light and dark | Switch the phone's theme and the in-app theme. | Both look right; the welcome, banners and tables are legible. | | |
| 6.3 | Text size 130% | Phone font scale to 130% (and the in-app text size to large). | No clipped buttons on the welcome, Home or session screens. | | |
| 6.4 | Small phone | A 360 px-wide phone (or 320 px browser window). | Welcome title on one line; install and verify pages without sideways scroll. | | |
| 6.5 | Medical wording | Look at About, the Pain card and the AI coach. | "Not medical advice" notes present and not in the way. | | |
| 6.6 | PDF export, first use offline | Online: export a plan PDF once. Then offline: export again. | First export works online; the second works offline (libraries now cached). A first-ever export with no signal fails (known). | | |

## 7. Timer, circuit and notification (Android)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 7.1 | Pause in the app | Run a circuit rest, pause it in the app, pull down the shade. | The notification freezes ("Paused · …") and offers Resume; it never counts below zero. | | |
| 7.2 | Pause in the notification | Press Pause on the notification, then Resume. | Freezes and continues from where it stopped; the app agrees when opened. | | |
| 7.3 | Reopen mid-rest | Lock the phone during a rest, wait, reopen the app. | The circuit is where the notification says, not reset. | | |
| 7.4 | Session pause | Pause the session (app, then notification) during a rest. | The rest pauses too; resuming the session resumes it. Resuming only the timer leaves the session paused. | | |
| 7.5 | Stopwatch | Start the stopwatch, background the app, pause it from the notification. | Stays as "Stopwatch paused" with Resume. | | |
| 7.6 | Circuit Back / Restart | In a circuit: Back after a few seconds, Back right after a step began, Restart. | First restarts the step, second goes to the previous step (its set is taken back); Restart asks first and starts at round 1. | | |
| 7.7 | Minimise | Minimise the circuit, then the session. | A pill with the phase, exercise and clock (tuck it with the arrow); the session bubble shows the same; a tap returns into the circuit. | | |
| 7.8 | Exercise details | Tap the note row in a circuit. | The exercise's details, note and how-to open; closing returns to the run. | | |
| 7.9 | Quick log notes | Finish a timed exercise or circuit member and open its log sheet. | "How it went" is empty (the plan note is shown above it, not copied in). | | |
| 7.10 | Sound style | Settings → Timer, sound & voice → Sound: pick each style. | Each plays a preview; the choice is used by the page and with the screen locked. | | |
| 7.11 | Volume | Move the slider (Settings and the speaker icon on a timer screen); turn on "also sets the media volume" with music playing. | Cues get quieter/louder; with the option, the music's volume returns afterwards. | | |
| 7.12 | Speaking | Leave "Speak the exercises" on Auto; run a circuit with the screen off, with a short switch, a long round rest and short rests (and try a slow voice speed). | "Next", a short beat, then the exercise and its reps/time; short rests get a shorter phrase and never run into the 3-2-1 beeps; the long rest repeats it near the end. Custom mode keeps the manual timings. | | |
| 7.12a | Speech timing | With Auto speech on (Android), run a circuit with a slow voice speed (try 0.6×, then 1.8×) and a 6-8 s switch. | The announcement always finishes before the set starts and never covers the 3-2-1 beeps; slow voices get shorter phrases. | | |
| 7.12b | Saying less | Run a 3-round circuit with Auto speech. | Round 1 says "Rest. Next, X, 12 reps"; later rounds just "Next, X" (reps only if they changed). | | |
| 7.12c | Set timer speech | In a self-paced set (e.g. 4 sets, 2 min rest) with Auto speech on, finish a set. | "Rest. Next, set 2 of 4" as the rest begins, again near its end; later rests drop "Rest." Works with the screen off. | | |
| 7.14a | Timer, no session | + → Timer → Pacer (0.5 min, 3 problems) → Open timer. | Opens ready ("Get ready"), not running; Start begins; Next problem, Pause, Restart and the tune button (change minutes/problems/get-ready) all work; the numbers apply from where you are. | | |
| 7.14b | Presets | Finish or end that run → Save as a preset. | Appears under Timer on the + screen and as a Home "Timer" card; tapping it opens the same timer ready to start; Edit on the sheet deletes it. | | |
| 7.14c | Exercise timer | Live session with a repeater (7 s / 3 s, 3 sets, 2 min rest) → Timer on its card. | The circuit-style runner: Hang n/N, Rest, set rests, Set 1/3 in the header; Log writes sets/reps/time and the rest between sets into the exercise. | | |
| 7.14d | Pacer in a session | A planned Free Bouldering exercise with a cadence and duration → Pacer. | Runs a problem per cadence; ending after 3 problems logs 3 sets, the time spent and the pace kept. | | |
| 7.14e | Next exercise | Log an exercise that has a timer while the next one has timing too. | The next one's timer opens ready for Start (never running); Settings → Timer → "Open the next exercise's timer" turns it off. | | |
| 7.14g | Timer without the service | Settings → Timer: allow exact alarms; start a pacer or repeater, lock the screen with the service unable to start (or it failing). | Rest-over / next-problem / done notifications arrive on time; opening the app clears them. (With exact alarms off, Android opens its Alarms & reminders setting instead.) | | |
| 7.14f | Per side | Plan 30 s per side (reps 2, timeOn 30, timeOff 5, repLabel Side). | Dial reads Side 1/2 then Switch. | | |
| 7.13 | Voice | Change the speech engine, voice, speed and pitch; tap Try it. | The sample changes; the timer uses the same. | | |

## 8. AI prompts

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 8.1 | Week dates | AI → generate: look at the prompt preview. | Week ids carry their dates ("2026-W40 (28 Sep – 4 Oct 2026)"), in the target timeframe, the target weeks, blocks and week notes. | | |

## 9. Settings layout

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 9.1 | Sections and pages | Open Settings; open each of the 8 sections. | Every section lists its pages (Reminders and About open straight into their page); back goes page → section → Settings → Home. | | |
| 9.2 | Search | Type "volume", "sync", "units", "tts" in the search box. | Each finds the setting and opens the page it is on; nonsense shows "Nothing called that". | | |
| 9.3 | Browser vs app | Open Settings in the browser build. | No Widgets, Health Connect or phone notifications; nothing else missing. | | |
| 9.4 | Paths in the text | Follow a few "Settings → …" mentions (glossary ?, welcome, AI coach screen, sync toast). | Each names a page that exists. | | |
| 9.5 | Tour | Replay the tour from About & Help; go through the Settings stops. | Each stop highlights a row on the Settings screen. | | |

## 10. Benchmark tests

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 10.1 | Upgrade from before fields | Update a phone that has logged max hangs (20/15/10 mm) and other benchmarks. | One "Max Hang" test with Edge depth + Added weight (no folders unless you make them); every old result is still there, under the right edge, with its value; nothing is lost (Settings → Training setup → Benchmark tests, and the Plan screen's list). | | |
| 10.2 | Units | Set the weight unit to lb; open a hang result and the logging form. | Weights are shown and typed in lb, and stored in kg (switching back shows the same load). | | |
| 10.3 | New test from a preset | Benchmark tests → New test → Weight for reps; save; log three results with different weights and reps. | Opens prefilled; the results land in one line (reps does not split it). | | |
| 10.4 | Set-up fields do not split the data | Log max hangs at two edges. | Test progress opens on "Like your latest" (the latest edge only) with an "Everything" chip; Home's progress card shows one row (the latest edge) until you save views for Home. | | |
| 10.5 | Two metrics over time | Progress → Over time: pick a second metric. | Two lines, each on its own scale (axes left and right), the readout shows both. | | |
| 10.6 | Explore | Progress → test chips → Adjust on the weighted pull-up test: Show reps across added weight. | Reps against weight, points joined in time order, the latest solid; tap a point for its readout (all other values listed). | | |
| 10.6a | Filter | Adjust → Only results with: Added weight None, then a 10 kg or more range. | None keeps results with no weight or 0; the range keeps the heavier ones; the headline and chart follow; "No results match" when nothing does. | | |
| 10.6b | Split lines | Adjust → One line per Added weight. | One coloured line per weight, a legend, "No added weight" for blank/0; more than six values keep the six most used and lump the rest as Other. | | |
| 10.6c | Best per period / curve | Adjust → Points: One per week or month (Best / Average); then across Added weight with Points: One per added weight. | Over time one point per period; against weight the best reps at each weight (your strength curve), readout says "best of n". | | |
| 10.6d | Saved views | Adjust → Save as a new view; Show on Home; reopen the test; Update; Delete. | The view appears as a chip and (when marked) as its own Home row, in the overview and in Insights; edits show "edited" until saved or reset; the views sync with the test. | | |
| 10.6e | Plan a test with a value set | Plan a test in a session: set Reps 1 and leave the weight empty (or set a weight and leave the reps). Ask the AI to schedule "a one-rep max" / "max reps at +10 kg". | The slot shows the set value; the result form opens with it filled and marked "planned"; the AI's item sets any field (not just set-ups) and leaves the rest open. | | |
| 10.11 | Update from before views | Update a phone that has hangs at several edges, a Max Pullups test and a 1RM Weighted Pullup test, and a weigh-in test. Open the app. | A "What's new" sheet opens once: notes, "Needs a look" (weigh-ins, combine pull-ups) and "Already done for you: Max Hang keeps a Home row for …". Max Hang's Home rows look as before. "Review your tests" opens Settings → Tests. | | |
| 10.12 | Combine and weigh-ins | In Tests: Move to Bodyweight, then tick Combine Max Pullups and … and Apply; then Undo. | Pull-ups gain Added weight; the heaviest-single results sit in it as 1 rep at their weight; Home has "Max reps, no weight" and "Heaviest single" rows with their own numbers; the old test is archived; Undo puts everything back. | | |
| 10.13 | Sheet shows once | Close the sheet (Not now), reopen the app. | It does not come back; About → What's new still lists changes. A fresh install never shows it. | | |
| 10.7 | Lower is better | Make a timed test (Timed effort preset), log two times, the second faster. | The change shows as a gain (green), in the progress card and the overview. | | |
| 10.8 | Estimated max and % of bodyweight | Chart a weight-for-reps test as "Estimated max"; chart a hang as "% of bodyweight" with a bodyweight logged near it. | Both draw; without a bodyweight the chart says what it needs. | | |
| 10.9 | Value types | Settings → Training setup → Value types: add your own number type, mark it "Benchmark tests" only; add it to a test. | It is offered for tests and not on exercises; deleting a value type used by a test is refused (archive instead). | | |
| 10.10 | AI | AI → copy the prompt after logging a hang at an edge. | The benchmark carries "conditions": "Edge depth 20 mm" in words (no ids). | | |

## 11. Plan calendar and phone calendar

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 11.1 | Switch views | Plan → the calendar icon next to the title, then the grid icon. | The calendar shows Day/Week/Month/Year; the grid icon returns to the block view as it was, on the week you were looking at. | | |
| 11.2 | Day and Week | Plan a session with a time and exercises; open Day, then Week. | Day shows it as a block as long as the session, with its exercises; Week shows the same in a column. Tapping opens the session. | | |
| 11.3 | Live session length | Run a session live that takes longer than planned; finish it. | In Day/Week its block is now the time it really took (and Day says "N min (M planned)"). | | |
| 11.4 | Month and Year | Open Month, tap a day; open Year, tap a month. | Dots per session (green = done); a tap goes down to Day / Month. | | |
| 11.5 | Phone calendar (Android) | Settings → Data & connections → Phone calendar → Show my calendar → Allow. | Your calendars are listed by account, the phone's visible ones ticked. Events appear grey beside the sessions in Day/Week and as a grey dot in Month; unticking a calendar removes its events. | | |
| 11.6 | Phone calendar: edge cases | Have an all-day event, one over midnight, a repeating one, one you declined. | All-day sits above the hours; the late one shows on both days; repeats appear every time; the declined one is absent. | | |
| 11.7 | Denied / revoked | Deny the prompt; later allow, then revoke in the phone's app settings. | A clear message each time, no crash; "Ask again" works. | | |
| 11.8 | Calendar file | Settings → Calendar & PDF → Export Calendar; open it in your calendar app. | Sessions are on their planned day and time (not the day they were created), with exercises in the description; finished ones as long as they took. "Include past sessions" adds history. | | |
| 11.9 | Week as a list | Settings → App & display (layout) → "Show the week as a list" on; Plan calendar → Week. | Seven day rows with full names, times and exercises; phone-calendar events muted beneath; a + on each row adds a session on that day. | | |
| 11.10 | Tap to add | Plan calendar → Week (grid) → tap an empty stretch of a day. | A new session opens already set to that day and the nearest half hour; closing it leaves nothing behind. | | |

## 12. Phases as days, sessions saved one by one

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 12.1 | Update keeps every week | Update a phone that has weeks you edited, weeks you never touched and past weeks. Open Plan and a few past and future weeks. | Every week shows the sessions it showed before the update; weeks you never touched still follow their phase (edit a phase's template: those weeks change, the edited ones don't). | | |
| 12.2 | One session at a time | In a week that follows its phase (dashed sessions), change one session's day or time. | Only that session stops being dashed; the others stay dashed. Edit the phase's template: the dashed ones follow, the changed one keeps your change. | | |
| 12.3 | Delete stays deleted | Delete a dashed session; reopen the app; edit the phase's template. | It stays gone. Undo (from the toast) brings it back. "Reset week to its phase" (the arrow icon on the week card) brings back deleted ones and drops your changes. | | |
| 12.4 | Log a dashed session | Start or log a dashed session. | It is saved as completed; the rest of the week stays dashed; the phase still shows its other sessions. | | |
| 12.5 | Past days are fixed | Leave a dashed session undone past its day, reopen the app on a later day, then change the phase's template. | The missed session is now saved (not dashed) and keeps what it was planned as; later weeks follow the new template. | | |
| 12.6 | Block manager: a phase from a day | Plan (block view) → tap the phase name on the week card. | The Block manager opens on that day: what is there, a list, and "Start a phase on …". Choose a phase and Start: the earlier block ends the day before, the new one runs to where the old one ended; the week's cell in the grid splits in two colours and the week card shows both phases with their days. Undo (toast) puts it back. | | |
| 12.7 | Block manager: edit dates | Edit a block's First day / Last day to overlap another block of the same priority. | Under the dates it says what happens to the other ("Deload now starts 17 Oct", "… is split …", "… is replaced") and which days are left without a phase; Save does exactly that; Undo reverts. A block with a different priority is left alone (concurrent). | | |
| 12.8 | Split week sessions | With a phase change mid-week, look at that week (and an untouched next week). | Each day's dashed sessions come from the phase that has that day; a session with no day appears once, from the phase with most days. | | |
| 12.9 | Phases in the calendar | Plan calendar → Week / Month; Settings → App & display → "Show phases in the calendar", "Write the phase name on it". | A colour strip under the days (Week, Day) and a bar under each date (Month) with the phase on each day; names where a phase starts; off removes them. Tapping the strip opens the Block manager on that day. | | |
| 12.10 | Sync | On two devices, delete a dashed session on one; wait for sync. | It is gone on the other too, and doesn't come back from the template. (Both devices must be updated first: older versions refuse to sync.) | | |
| 12.11 | Trips and competitions in the calendar | Add a trip (3 days) and a competition; Plan calendar → Week and Month. | Week/Day: a bar across the trip's days (cut at the week's edge if it goes on) and a warm one for the competition; Month: a bar along the top of each of those days; the week list names them on their days. | | |
| 12.12 | Drag to reschedule | Plan calendar → Week: press and hold a planned session ~0.4 s, then drag it to another day and time; let go. Also: just swipe or scroll over a session. | The block lifts and follows the finger; on release the session is on the new day at the nearest quarter hour (and in that week). A quick swipe/scroll never moves anything or opens a session; a drop outside the grid does nothing; finished, running and Plan B sessions can't be dragged. Tapping still opens the session. | | |
| 12.13 | AI: a phase for exact days | AI → Change plan: ask for "a deload starting Thursday this week for a week". Review and apply; then Undo. | The reply uses "fromDate"/"toDate"; the review shows "phase … → Deload from … to …" and how many sessions you already changed on those days stay; applying splits the week (grid cell, week card); sessions still following the phase move to Deload's, ones you changed stay; Undo restores. | | |
| 12.14 | Phases in Month and Year | Plan calendar → Month, Year. | One line per phase along each week row (breaking where the phase changes or the row ends), under the dates; no line on days without a phase. | | |
| 12.15 | Import and update | Settings → Data → import a backup made before this version; or update the app over an older install. | All weeks look as before the update; weeks you never touched follow their phase; cleared weeks stay empty; nothing is doubled. | | |
| 12.16 | Calendar look | Plan → calendar (Day, Week, Month) in dark, then light theme, on a phone and a tablet. | Flat, edge to edge, no box; thin hour lines with dotted half hours and a red "now" line; each session a solid colour block (strong on dark with white text, pastel on light with dark text) in the colour of its main category; today's date filled; the header (title, switch, +) never moves between views. | | |
| 12.17 | Pinch to zoom | Week or Day: pinch two fingers out over the grid; pinch back in; double-tap the hour numbers. (Laptop: ctrl + scroll.) | The hours get taller or shorter around your fingers and the page doesn't zoom; a long session shows its banner with each exercise as its own block in its category colour once tall enough; double-tap on the hours resets; the zoom is remembered. A swipe or scroll with one finger still pages / scrolls. | | |

## 13. Navigation: drawer, rail, floating +

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 13.1 | Drawer on a phone | Portrait phone: tap the menu button (top left) on each screen. | A drawer slides in: Home, Plan, Log a workout, History, Analytics, then Settings and Take the tour. The current screen is highlighted. Choosing one closes it and goes there. | | |
| 13.2 | Closing | Open the drawer, then: tap outside; press the phone's back key; (keyboard) Escape. | Each closes it and stays on the same screen; focus returns to the menu button. Back with the drawer closed on any screen but Home goes Home, as before. | | |
| 13.3 | Floating + | Home, History, Analytics: tap +. Plan (blocks and calendar): tap +. Log, Settings: look. | Home/History/Analytics: Log a workout opens. Plan: a new session for the selected day (today, or the calendar's focused day). Not shown on Log or Settings, nor while a session is running (the session bubble has the corner), nor while editing a Plan B. | | |
| 13.4 | Things above it | Show a toast (delete a session); minimise a quick timer. | Both sit above the + (never over it); the session bubble takes the corner while a session runs. | | |
| 13.5 | Tablet, laptop, landscape | Open on a tablet, in a laptop window and with a phone on its side. | A slim rail on the left (menu, five icons, Settings at the bottom); the menu button there opens the full drawer; no menu button in the top bar; the floating + as on a phone. | | |
| 13.6 | Running session | Start a session, minimise it, open the drawer. | "Resume session" with the minutes so far is first; it reopens the session. | | |
| 13.7 | Bottom bar setting | Settings → App & display → Look & feel → Navigation → Bottom bar; then back. | The old bar returns (Settings and the tour are in Home's top bar again, the calendar's + is back in its header); switching back restores the drawer. Per device: a second device keeps its own choice. | | |
| 13.8 | Top bar | Move through every screen. | The top bar is always the same height and in the same place; titles, and each screen's own buttons (quick log, Plan's view switch and AI coach, History's filter, Analytics' paging) on the right; Settings sub-pages show a back arrow. | | |

## 14. Live session: circuits, weights, notification (2026-10-15)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 14.1 | Skip in a circuit | Session with a circuit of 2+ exercises: tap Skip (or swipe left) on one of them. | A sheet: "Just <it>" or "The whole circuit". Just it: the circuit's Start now runs without it and its rests follow the others; whole circuit: all members skipped, one Undo brings them back. Settings → Sessions & timer → Circuits → "Ask what to skip" off: it skips only that exercise. | | |
| 14.2 | Stop with a circuit running | Start a circuit, do a set or two, minimise it, Stop → Save what I did. | The Stop sheet says the circuit's N sets are logged and it stops; the rating opens; the circuit's timer, beeps and notification are gone; the members it did sets for show as done in the saved session, the others unlogged. Discard drops everything. | | |
| 14.3 | A second circuit | With circuit A started, tap Start circuit on B. With A only opened (never started), do the same. | Started: a sheet "A is still running" (back to it / drop it and start this). Never started: B just opens. No button is greyed without a reason. | | |
| 14.4 | Planned weight | AI-planned hang with "+12.5 kg" (type tracks no weight): finish it, and open "Set details" in its circuit. | Weight is a field (stepper 2.5 kg) with the target beside it; the details sheet offers Weight. Any exercise with sets/reps/time and no weight shows "Add weight". | | |
| 14.5 | Hold or Hang | Run a circuit with Chin Tucks (timed reps) and Max Hangs. | Dial and notification say "Hold 3/8" for the tucks, "Hang 3/5" for the hangs. | | |
| 14.6 | Notification buttons | Run a circuit with the screen off. | During a set: Pause, Done, Skip. Done ends the set now (a counted one with its target reps), Skip records it as not done, the timer moves on and the notification follows; during a rest one Skip button; a pacer has Done only. Pausing and resuming from the notification keeps Done and Skip. | | |
| 14.7 | Floating + on scroll | History or Analytics: scroll down, then up. | The + slides away going down and returns going up, at the top and at the end of the list; it never covers the last row. | | |
| 14.8 | Week list on a phone | Plan → calendar → Week on a portrait phone, a tablet and a phone on its side; then Settings → App & display → Plan calendar & day. | Portrait phone: the list (setting "List on a phone held upright", which is on that page along with the other calendar settings and "New day starts at"); tablet and landscape: the hour grid. | | |

## 15. Navigation mode, top bar, calendar look (2026-10-15)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 15.1 | Automatic navigation | Phone upright, then on its side, then a tablet / laptop. Settings → App & display → Look & feel → Navigation: Automatic, Bottom bar, Side drawer. | Automatic: bottom bar on the upright phone; rail + drawer + floating + on a phone on its side, a tablet, a laptop. The other two pin that one everywhere. An install that had the drawer before starts on Automatic. | | |
| 15.2 | Top bar on scroll | Scroll down through Home, Plan (blocks), History, Analytics; then up a little. Settings → Look & feel → Top bar: turn "Hide the top bar while scrolling" off. | The bar slides up and away going down, returns going up (soft edge over content, never a see-through band). Off: it stays, with the soft edge once content is under it. | | |
| 15.3 | Nothing over the bar | Plan → blocks view, scroll so the year labels ("2026", "2027") pass the top. Analytics charts with tips. | Nothing is drawn over the top bar. | | |
| 15.4 | Week list order | Plan → calendar → Week (list) on a day with sessions and phone-calendar events. | One list in time order (all-day first, sessions without a time last); each item shows its start time. | | |
| 15.5 | Block planner button | Plan: blocks view, then calendar view. | The block planner button (three bars) is in the top bar in both. | | |
| 15.6 | Calendar look | Week list, Day, Week grid, Month; chips and "Exercises as a list" (Settings → Plan calendar & day); light and dark; phone and tablet. | Sessions are large rounded blocks with room around the text; exercises as soft pills or as lines with colour dots; in the hour grids, exercise blocks are rounded with gaps between them. Nothing cramped or square-edged. | | |

## 16. Places, previews, event details (2026-10-16)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 16.1 | Week layout toggle | Plan → calendar → Week: tap the two icons next to Day/Week/Month/Year (phone upright, tablet). | Hour columns or the list, remembered; on a phone the columns are the Samsung-style grid with wrapped names. Settings → Plan calendar & day shows the same choice. | | |
| 16.2 | Phone event details | With the phone calendar switched on (Settings → Phone calendar): tap an event in the week list, the Day/Week grid. | A sheet: title with the event's colour, when (also across midnight / all day), where with "Find on map" (opens Maps), the calendar's name, notes as plain text. Read-only. Needs the new APK (the plugin reads location and notes now). | | |
| 16.3 | Places | Settings → Model & health → Places, weather & outdoor. Existing home and crags are listed. Add a gym; rename a place; search a city for coordinates; paste "47.0502, 8.3093"; price, hours, notes; Open in Maps; reorder; remove. | The home and crags with coordinates still drive Home's weather and the Crags card; renaming a place renames it on sessions that name it; removing keeps the name as text on sessions. | | |
| 16.4 | A session's place | Session editor → Where chip: pick a place, type another, clear. Phase template editor → Where. | The chip shows it; it appears on the session in lists and on Home's Today row; weeks generated from the template and copied weeks carry it. | | |
| 16.5 | Session preview | Tap a session in the calendar (list, Day, Week, Month → day). | A preview: status and length, when, where (price, hours, notes of the place; the day's forecast if the place has coordinates), the note, exercise names (a circuit as one line). Open goes to the full session, Start starts it (Resume if it is the running one). | | |
| 16.6 | AI and places | AI coach → Change plan: ask for "the board session at <your gym>". AI sharing → Places off, copy the prompt again. | The prompt lists "My Places" (no coordinates); the reply's "place" lands on the session (a name that is not a saved place is kept with a warning); with the switch off the section is gone. | | |
| 16.7 | Places are in the database | Update over a version that had places set up. Settings → Places. Settings → Backup → export, look for "places". | The places are all still there (they moved from this device's settings into the database on first start); the export file has a "places" list; a restore brings them back. With Drive sync on, a place added on one device shows on the other. | | |
| 16.8 | AI coach adds and edits places | AI coach → Change plan: "add the gym Boulderwelt Regensburg (day pass CHF 22, open 9-23) and put Tuesday's board session there". Then ask it to change the price and rename it. | The review has a Places row ("+ Boulderwelt Regensburg", its kind, price, hours) that can be unticked, and the Tuesday session names it without a "not one of your saved places" warning. Apply adds the place; a rename carries to the sessions that name it. Coordinates, if the AI gives any, come with a "check on a map" warning. | | |
| 16.9 | Organise → Places | AI coach → Organise: tick only Places. Copy the prompt (no coordinates in it; each place says how many sessions name it), paste a reply that merges two places or fixes names and notes. | Edits and removals in the review; "remove" warns how many sessions keep the name as text; nothing is applied unticked. The area is greyed out when AI sharing → Places is off. | | |
| 16.10 | Undo covers places | After 16.8 or 16.9: undo from the toast, and from Plan → history. | The places list is back as it was, and so are the sessions' place names (logged sessions too). | | |
| 16.11 | Top bar scrolls | Scroll down on Home, History, Plan, Settings, then up. | The top bar scrolls away with the content and nothing is stuck at the top; it is at the top again when you scroll back. The bottom bar and the + behave as before. | | |
| 16.12 | Long phone events | Plan → Day and Week with a phone event that runs overnight or over several days (e.g. 00:00-12:00, or a trip). | The hour grid keeps its layout: the event is cut at the first and last hour shown, nothing draws over the header; all-day and multi-day events sit in the strip above the hours. | | |

## 17. Samsung-style calendar: bars, colours, chips (2026-10-18)

Logic is unit-tested (`headerBars`, `eventColor`, `calendarSessionColor`); the look was only checked in headless Chrome with made-up phone events, nothing on a real phone.

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 17.1 | Header bars | Plan → Week (hour columns) and Day, with phone events that are all-day, span several days, or last 12 h or more, plus a trip and a competition. | Each is one bar across its days above the hours (your goals on the top rows, then events); a bar cut by the week's edge is square on that side; a tap on an event bar opens its details. Shorter events stay on the hour grid, split at midnight. | | |
| 17.2 | "+N" and show less | Make more than three rows of overlapping bars (several multi-day events). | Two rows of bars and a "+N" row under the days that have more; tapping "+N" shows every row, "Show less" folds them again. | | |
| 17.3 | One session colour | Plan → any view. Settings → Plan calendar & day → "Colour sessions by exercise category" off (default) / on. | Off: every session is the same green (a planned, not-yet-confirmed one softer); the exercise colours only show inside a block when zoomed in. On: the old category colours. | | |
| 17.4 | Event colours | With calendars in teal, green, blue, yellow, red. | Each event has its calendar's colour in a soft tone; a green or teal one is turned (towards blue or lime) so it never looks like a session. Light and dark theme both readable. | | |
| 17.5 | Pick a calendar's colour | Settings → Phone calendar → tap a calendar's dot: pick from the swatches, then the "+" for any colour (system colour picker - check it opens on the phone), then "Phone's colour". | The events of that calendar change at once on the Plan calendar; a picked green stays green (as chosen); "Phone's colour" goes back. Survives closing the app. | | |
| 17.6 | Calendar chips | Two or more phone calendars. Tap chips under the header; scroll the row sideways. | The calendar's events appear / disappear (same as the checkboxes in Settings); the row scrolls without paging the calendar; not shown with one calendar or the phone calendar off, nor in Year. | | |
| 17.7 | Phase and today tint | Settings → "Tint each day with its phase" on/off; look at Day and Week. | A very light wash of the phase's colour behind each day (not in the list view), today's column slightly lighter/darker than the rest; with the setting off only today's column. | | |
| 17.8 | Slimmer week on a phone | Plan → Week, hour columns, phone upright. | Hour labels take less room, day columns are a little wider; names still wrap in narrow lanes. | | |

## 18. Calmer panels (2026-10-18)

Only checked in headless Chrome at phone width (dark and light), not on a phone or tablet.

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 18.1 | Soft panels | Home, Analytics (all four tabs), History, Settings, the Plan week card, in dark and light. | Grouped content is a faint rounded panel with no border or shadow; nothing looks cut off or invisible; text contrast is fine. | | |
| 18.2 | Flat sections | Settings → Plan calendar & day → "Flat sections instead of panels" on; go through the same screens. | No panels: sections separated by whitespace and a hairline, aligned with the page edge, no clipped content. Off again restores the panels. | | |
| 18.3 | Quiet block grid | Plan → block view. Tap a week, page with the arrows, a week split between two phases, a year change. | Soft rounded weeks, selected = ring, this week = dot, the year inside its first week; the tooltip on hover (tablet/laptop) readable; overlapping-blocks dot visible. | | |
| 18.5 | Sheets and editors | Block manager (list, add, edit), AI coach (all four modes), a session editor, phase template editor, benchmark forms. | No outlined boxes around groups; idle buttons filled; notices (warning, error) still stand out by their tint; inputs keep their outline and are easy to find. | | |
| 18.4 | Filled chips | Plan B card (Edit B, Decide), Arrange, other chips; a selected chip (e.g. in the AI coach). | No outline on idle chips; selected ones still show their primary colour. | | |

## 19. Analytics rebuilt by question (2026-10-19)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 19.1 | Tabs | Analytics: Overview, Training, Recovery, Progress. | Overview: summary tiles (once), Worth a look, the load chart, the training calendar. Training: its findings, mix, "More charts" (strain, finger load) folded. Recovery: findings, fatigue, recovery chart, pain. Progress: findings, exercises, sends, tests. Range, paging and CSV are there on every tab. | | |
| 19.2 | Findings | Tap a finding on Overview and on a tab. | Overview lists what needs attention first (then up to two good ones, and always the load verdict); a tab lists the findings for its charts. Tapping goes to the chart on its tab (opening More charts if needed) or the ACWR/plan/block/exercise sheet. | | |
| 19.3 | Load chart | Overview → Rolling load on 4W, 3M, 1Y. | Bars with a few labelled lines, ramp-spike flags over their bars; under them the ratio strip with tinted zones and the 0.8 / 1.5 edges, dots coloured by zone; the same columns line up; labels thin out without running together. | | |
| 19.4 | Recovery layout | Recovery tab: Overlay / Rows. | The overlaid % chart as before; Rows gives one row per measure; the choice is kept. | | |
| 19.5 | Settings | Settings → History & Analytics: hide a card, reorder. | Hidden cards go from their tab; with a tab empty the note says so (not Overview); the order within a tab follows the list. | | |

## 20. Calendar contrast and swiping (2026-10-20)

| # | Test | Steps | Expected | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 20.1 | Calendar contrast | Plan → Week/Day with phone events in a pale colour, light theme. Settings → Plan calendar & day → Higher contrast on/off. | Pale events have a visible edge and tint against the grey ground; with the setting on, sessions and events are solid with a firmer edge (also on dark and in Month and the week list). | | |
| 20.2 | Swipe | Plan (Day, Week, Month, list): swipe left and right ten times each, starting on blocks, on bars, on empty ground, with a slightly slanted thumb. Hold a session and drag it to another day. | Every swipe pages (left = later); nothing opens after a swipe; dragging a held session moves it and does not page. | | |
| 20.2a | Edges setting | Settings → Plan calendar & day → Edges on phone-calendar events on/off, with Higher contrast off and on. | Off: no edge on events (Day, Week, bars, Month, list). On: a fine edge. Higher contrast on: a firm edge whatever this says. | | |
| 20.2b | Chips order, session card | Two or more phone calendars: switch some off and on. Plan → Day, zoom in (pinch) on a session with several exercises. | The chips that are on are always at the left, off ones after them. The session card is one rounded card: banner on top, exercise blocks on a faint wash of the session colour (stronger with Higher contrast). | | |
| 20.3 | AI sees the calendar | Android, phone calendar on. Settings → What the AI sees: Phone calendar on. AI coach → Change plan over a week with events → look at the prompt. Switch it off and look again. | With it on, a "My Calendar" list of title and time (day, time range; all-day as dates) for those weeks only, no places or notes; with it off, no such section. The switch is absent in the browser. | | |
| 20.4 | Privacy policy | Open the privacy policy (Settings → About). | Dated 15 October 2026; has Phone calendar, places in the data list, Weather wording for places, AI prompts including the direct connection and the calendar switch. | | |

## After the run

- Anything marked fail: note the build (Settings → About & Help) and the platform, and open an issue.
- If 2.6 or the site's verify values are wrong, don't post until fixed: the whole "check the build" claim depends on them.
- Re-run sections 1 to 3 on a clean device after the final deploy, from the public link (not a dev build).
