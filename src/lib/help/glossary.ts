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
  | "notSaved";

export interface Term {
  title: string;
  paragraphs: string[];
}

export const GLOSSARY: Record<TermId, Term> = {
  load: {
    title: "Load",
    paragraphs: [
      "Load is a score for how hard a session was, in points. It grows with time and, faster than linearly, with intensity: minutes × intensity^1.2, where intensity is on a 1–10 scale.",
      "Planned load uses each exercise's planned time and intensity. A completed session's load uses how hard it felt: the fingers, systemic and core ratings you give after the session.",
      "As a guide: an hour at a moderate 5/10 is about 400 points, an hour at 8/10 about 730. The number only means something compared with your own other weeks.",
    ],
  },
  acwr: {
    title: "Acute:chronic ratio (ACWR)",
    paragraphs: [
      "Your load over the last 7 days divided by your average weekly load over the last 28 days. It shows whether you're suddenly doing much more (or less) than you're used to.",
      "Around 0.8–1.3 is the usual sweet spot. Above about 1.5 means a sharp jump, a common time for finger and shoulder injuries. Below 0.8 means you're doing less than usual, which is fine for a rest week.",
      "It needs about four weeks of logged sessions before it's meaningful. You can change the zones under Settings → Appearance & Behaviour → Training model.",
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
      "The load from exercises in finger-heavy categories (hangboard, limit bouldering, board…), so you can see finger stress on its own.",
      "Which categories count is set in the card's Categories picker.",
    ],
  },
  fatigue: {
    title: "Fatigue",
    paragraphs: [
      "After each session you rate how tired your fingers, arms, core and whole body are (0–10). The app lets that rating fade over the next days: by default it halves every 3 days.",
      "So the fatigue shown today is what's left of your recent ratings. 7 or more means that area still needs rest. The fade speed is under Settings → Appearance & Behaviour → Training model.",
    ],
  },
  mix: {
    title: "Training mix",
    paragraphs: [
      "How your training time splits across categories (technique, power, fingers, strength…). Done is what you logged; planned adds the sessions still to come.",
      "Categories come from each exercise's type and can be edited under Settings → Customization.",
    ],
  },
  phases: {
    title: "Phases & blocks",
    paragraphs: [
      "A phase is a kind of training week (Capacity, Strength, Power…) with a typical set of sessions. Pick a phase for a week and those sessions appear on its days.",
      "A training block puts phases on a run of weeks, e.g. 3 weeks Strength then 1 Deload. You can still change any single week; only that week is affected.",
      "The phases' sessions can be edited under Settings → Customization → Training phases, where you can also switch between the Getting started and Advanced sets.",
    ],
  },
  notSaved: {
    title: "Not saved yet",
    paragraphs: [
      "This week's sessions come straight from its phase. Until you change the week, it simply shows what the phase says, so editing the phase updates it too.",
      "The week is saved as it is as soon as you log or change anything in it, when the week ends, or when you tap Lock In. After that, changes to the phase no longer touch it.",
    ],
  },
};
