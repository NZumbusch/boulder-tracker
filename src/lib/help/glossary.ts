import { settingsPath, type PageId } from "../settings/tree";

/**
 * Short explanations of the app's training terms, opened from the (?)
 * buttons next to them (`InfoButton` → `InfoSheet`). One place, so a
 * formula change means one text to update - keep them in step with
 * `lib/analytics/load.ts`, `loadAnalytics.ts` and `proMetrics.ts`.
 */
export type TermId =
  | "load"
  | "acwr"
  | "monotony"
  | "fingerLoad"
  | "fatigue"
  | "mix"
  | "phases"
  | "tests"
  | "notSaved"
  | "planB"
  | "rhr"
  | "rampRate"
  | "tokens"
  | "readiness";

export interface Term {
  title: string;
  paragraphs: string[];
  /** The Settings page where what the term describes can be changed; the sheet offers a link to it. */
  where?: PageId;
}

export const GLOSSARY: Record<TermId, Term> = {
  load: {
    title: "Load",
    paragraphs: [
      "Load is a score for how hard a session was, in points. It grows with time and, faster than linearly, with intensity: minutes × intensity^1.2, where intensity is on a 1–10 scale.",
      "Planned load uses each exercise's planned time and intensity. A completed session's load uses how hard it felt: the fingers, systemic and core ratings you give after the session.",
      "As a guide: an hour at a moderate 5/10 is about 400 points, an hour at 8/10 about 730. The number only means something compared with your own other weeks.",
      "Because the two come from different inputs, the app never puts one against the other. \"% of the plan\" compares like with like: the logged exercises against the planned ones.",
    ],
  },
  acwr: {
    title: "Acute:chronic ratio (ACWR)",
    where: "model",
    paragraphs: [
      "Your load over the last 7 days (a rolling week ending today, not the calendar week) divided by your average weekly load over the last 28 days. Tap the ACWR chip on Home to see the weeks it is made of. It shows whether you're suddenly doing much more (or less) than you're used to.",
      "Around 0.8–1.3 is the usual sweet spot. Above about 1.5 means a sharp jump, a common time for finger and shoulder injuries. Below 0.8 means you're doing less than usual, which is fine for a rest week.",
      `It needs about four weeks of logged sessions before it's meaningful. You can change the zones under ${settingsPath('model')}.`,
    ],
  },
  tests: {
    title: "Tests",
    where: "benchmarks",
    paragraphs: [
      "A test is something you repeat now and then to see whether you are improving: a max hang, max pull-ups, a one-rep max. Each records a result (the number you are chasing) and whatever else matters: the edge depth, the hang time, the load or the reps - every value is kept.",
      "In the chart you choose how to look at them: all results, only some (no added weight, 10 kg or more, a 20 mm edge), one line per weight or edge, the best per week or month, or one value against another - reps against weight, best reps at each weight. Save a view with the test and it can show on Home.",
      "Plan a test inside a session (Test in the session editor, or Add → test while you train), setting beforehand whatever the test is to be done at - the reps to find a heaviest single, a weight to find the reps - and enter the result when you do it; it is saved as a result linked to that session. The Progress tab charts each test, and \"All tests\" shows every one as % change since its first result. The AI sees your results and when each test is due (6 weeks by default, changeable under Reminders), and can schedule one for you.",
    ],
  },
  monotony: {
    title: "Monotony & strain",
    paragraphs: [
      "Monotony is how evenly your load is spread over the week: the average daily load divided by how much it varies. Hard days mixed with easy and rest days keep it low.",
      "Above 2 means too few easy days. Strain is the week's load times its monotony, so a big week with no easy days scores highest.",
    ],
  },
  fingerLoad: {
    title: "Finger load",
    paragraphs: [
      "The load from just the categories you pick in the card's Categories picker, so you can see one kind of stress on its own.",
      "It starts with the finger-heavy categories (hangboard, limit bouldering, board…) for finger load - pick others to follow arms, core or anything else.",
    ],
  },
  fatigue: {
    title: "Fatigue",
    where: "model",
    paragraphs: [
      "After each session you rate how much that session took out of your fingers, arms, core and whole body (1–10) - what it added, not how you feel overall. Each rating fades over the next days: by default it halves every 3 days.",
      "The fatigue shown today is what's left of every recent session, stacked: each session uses up its share of the capacity that's still free, so two medium sessions read about 7.5 rather than 10, and the reading only nears 10 when sessions really pile up. Rest days count as nothing, so it falls while you rest and climbs when sessions come close together. 7 or more means that area still needs rest.",
      `The fade speed, and an option to soften how stacked sessions add up, are under ${settingsPath('model')}.`,
    ],
  },
  mix: {
    title: "Training mix",
    where: "exercises",
    paragraphs: [
      "How your training time splits across categories (technique, power, fingers, strength…). Done is what you logged; planned adds the sessions still to come.",
      `Categories come from each exercise's type and can be edited under ${settingsPath('exercises')}.`,
    ],
  },
  phases: {
    title: "Phases & blocks",
    where: "phases",
    paragraphs: [
      "A phase is a kind of training (Capacity, Strength, Power…) with a typical set of sessions, which appear on the days it covers.",
      "A training block puts a phase on a run of days - it can start or end mid-week, so a week can hold two. Phases are edited in the Block manager (tap a phase name on the Plan). You can still change any single session; only that session is affected.",
      `The phases' sessions can be edited under ${settingsPath('phases')}, where you can also switch between the Getting started and Advanced sets.`,
    ],
  },
  notSaved: {
    title: "Not saved yet",
    paragraphs: [
      "A dashed session comes straight from its phase. It stays that way, following the phase, until you log it, change it, move it or delete it - then it is saved on its own.",
      "The rest of the week keeps following the phase, so changing Monday never freezes Thursday. A day that has passed is saved as it was planned, so your history doesn't change when the phase does.",
    ],
  },
  planB: {
    title: "Plan B (uncertain days)",
    paragraphs: [
      "Some days could go either way: outdoors if it is dry, otherwise the board. Plan A is the version you expect; Plan B holds the other one.",
      "Pick one when you know. Until then the likely one counts towards the week's planned load. You make a Plan B from a session's menu or the week's ⋯ menu.",
    ],
  },
  rhr: {
    title: "Resting heart rate (RHR)",
    paragraphs: [
      "Your heart rate when you are calm, in beats per minute. It comes from your watch through Health Connect, or from what you enter by hand.",
      "What matters is how it compares with your own usual level: several beats above it for a few days often goes with tiredness, illness or poor sleep. Lower is better here, so a falling line is good news.",
    ],
  },
  rampRate: {
    title: "Ramp rate",
    paragraphs: [
      "How much this week's load grew compared with the week before, as a percentage. +10% means one tenth more than last week.",
      "A jump of more than about 10% from one week to the next is flagged: fast increases are when finger and shoulder injuries tend to happen. After a rest week a large percentage is normal, so look at it together with the acute:chronic ratio.",
    ],
    where: "model",
  },
  tokens: {
    title: "Tokens (prompt size)",
    paragraphs: [
      "An AI model reads text in pieces called tokens, roughly three quarters of a word each. The number shows how long the prompt is.",
      "A longer prompt costs more when you pay per use and may not fit in a free chat. You can leave things out under What the AI sees.",
    ],
    where: "aiSharing",
  },
  readiness: {
    title: "Readiness",
    paragraphs: [
      "One score, 0 to 100, for how ready you are to train hard today. It starts at 100 and loses points for recent fatigue, a sharp jump in load, open pain and, if you log them, poor sleep or a dip in heart-rate variability.",
      "Tap the ring on Home to see what moved it. It is a guide for the day, not a verdict: how your fingers feel counts for more.",
    ],
    where: "model",
  },
};
