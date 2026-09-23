import { describe, it, expect } from "vitest";
import {
  validateAIPlanOutput,
  validateAIWorkoutLogOutput,
  parseAIPlanOutput,
  parseAIWorkoutLogOutput,
  AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS,
} from "./schema";
import { AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";
import { EXERCISE_VALUE_SPEC, EXERCISE_VALUE_FIELD_NAMES } from "./valueSpec";

const VALID_PLAN = {
  weeks: [
    {
      weekId: "2026-W25",
      phaseName: "Capacity",
      workouts: [
        {
          name: "Fingerboard AM",
          dayOfWeek: "Monday",
          exercises: [
            { exerciseTypeName: "Hangboard", values: { duration: 30, sets: 5, reps: 6, timeOn: 10, timeOff: 180 } },
          ],
        },
      ],
    },
  ],
};

const VALID_LOG = {
  workouts: [
    {
      date: "2026-09-16",
      name: "Evening session",
      exercises: [{ exerciseTypeName: "Free Bouldering", values: { duration: 90, climbingStyle: ["Power"] } }],
    },
  ],
};

describe("validateAIPlanOutput", () => {
  it("accepts a well-formed plan", () => {
    const result = validateAIPlanOutput(VALID_PLAN);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data?.weeks[0].weekId).toBe("2026-W25");
    expect(result.data?.weeks[0].workouts[0].exercises[0].exerciseTypeName).toBe("Hangboard");
  });

  it("accepts an empty weeks array", () => {
    const result = validateAIPlanOutput({ weeks: [] });
    expect(result.valid).toBe(true);
    expect(result.data?.weeks).toEqual([]);
  });

  it("accepts a week with zero workouts (rest/deload week)", () => {
    const result = validateAIPlanOutput({ weeks: [{ weekId: "2026-W25", phaseName: "Deload", workouts: [] }] });
    expect(result.valid).toBe(true);
  });

  it("ignores unrecognized extra fields anywhere in the document", () => {
    const withExtras = JSON.parse(JSON.stringify(VALID_PLAN));
    withExtras.rationale = "because periodization";
    withExtras.weeks[0].commentary = "peak week";
    withExtras.weeks[0].workouts[0].exercises[0].values.madeUpField = "ignored";
    const result = validateAIPlanOutput(withExtras);
    expect(result.valid).toBe(true);
  });

  it("coerces a numeric field given as a numeric string", () => {
    const withStringNumber = JSON.parse(JSON.stringify(VALID_PLAN));
    withStringNumber.weeks[0].workouts[0].exercises[0].values.duration = "30";
    const result = validateAIPlanOutput(withStringNumber);
    expect(result.valid).toBe(true);
    expect(result.data?.weeks[0].workouts[0].exercises[0].values.duration).toBe(30);
  });

  // --- Deliberately malformed / adversarial cases ---

  it("rejects non-object top-level input", () => {
    expect(validateAIPlanOutput([1, 2, 3]).valid).toBe(false);
    expect(validateAIPlanOutput("just a string").valid).toBe(false);
    expect(validateAIPlanOutput(null).valid).toBe(false);
    expect(validateAIPlanOutput(42).valid).toBe(false);
  });

  it("rejects a document with neither a weeks nor a phases array", () => {
    const result = validateAIPlanOutput({ notWeeks: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /phases.*weeks/.test(i.message))).toBe(true);
  });

  it("rejects when weeks is not an array", () => {
    const result = validateAIPlanOutput({ weeks: "week 25" });
    expect(result.valid).toBe(false);
  });

  it("rejects a week missing weekId", () => {
    const bad = { weeks: [{ phaseName: "Capacity", workouts: [] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].weekId")).toBe(true);
  });

  it("rejects a malformed weekId format", () => {
    const bad = { weeks: [{ weekId: "week 25 of 2026", phaseName: "Capacity", workouts: [] }] };
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a week missing phaseName", () => {
    const bad = { weeks: [{ weekId: "2026-W25", workouts: [] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].phaseName")).toBe(true);
  });

  it("rejects an empty-string phaseName", () => {
    const bad = { weeks: [{ weekId: "2026-W25", phaseName: "   ", workouts: [] }] };
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a workout missing the exercises array", () => {
    const bad = { weeks: [{ weekId: "2026-W25", phaseName: "Capacity", workouts: [{ name: "Session" }] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].workouts[0].exercises")).toBe(true);
  });

  it("rejects an exercise missing exerciseTypeName", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    delete bad.weeks[0].workouts[0].exercises[0].exerciseTypeName;
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("exerciseTypeName"))).toBe(true);
  });

  it("rejects an empty-string exerciseTypeName", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].exerciseTypeName = "";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  // Behaviour deliberately changed 2026-09-21: prose in a numeric field used
  // to reject the whole import. A real 15-week plan produced ~170 of these,
  // so it is now repaired - the field is dropped (never guessed at) and the
  // text is preserved in `notes`, with the substitution reported.
  it("repairs prose in a numeric field by moving it to notes", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.sets = "a lot";
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(true);
    const values = result.data!.weeks[0].workouts[0].exercises[0].values;
    expect(values.sets).toBeUndefined();
    expect(values.notes).toContain("a lot");
    expect(result.repairs.some((i) => i.path.endsWith("values.sets"))).toBe(true);
  });

  it("rejects a boolean for a numeric field", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.duration = true;
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("repairs a bare string where a string[] field is expected", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.climbingStyle = "Power";
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(true);
    expect(result.data!.weeks[0].workouts[0].exercises[0].values.climbingStyle).toEqual(["Power"]);
    expect(result.repairs.some((i) => i.path.endsWith("values.climbingStyle"))).toBe(true);
  });

  it("keeps the legal members of a mixed-type array and rescues the rest", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.climbingStyle = ["Power", 3];
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(true);
    const values = result.data!.weeks[0].workouts[0].exercises[0].values;
    expect(values.climbingStyle).toEqual(["Power"]);
    expect(values.notes).toContain("3");
  });

  it("accepts an optional startTime and plannedDuration on a session", () => {
    const timed = JSON.parse(JSON.stringify(VALID_PLAN));
    timed.weeks[0].workouts[0].startTime = "18:00";
    timed.weeks[0].workouts[0].plannedDuration = 90;
    const result = validateAIPlanOutput(timed);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data?.weeks[0].workouts[0].startTime).toBe("18:00");
    expect(result.data?.weeks[0].workouts[0].plannedDuration).toBe(90);
  });

  it("leaves startTime and plannedDuration undefined when the session omits them", () => {
    const result = validateAIPlanOutput(VALID_PLAN);
    expect(result.data?.weeks[0].workouts[0].startTime).toBeUndefined();
    expect(result.data?.weeks[0].workouts[0].plannedDuration).toBeUndefined();
  });

  it.each([
    ["9:30", "09:30"],
    ["09:30:00", "09:30"],
    ["6pm", "18:00"],
    ["6:30 PM", "18:30"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
  ])("repairs the startTime %s to %s", (written, normalised) => {
    const plan = JSON.parse(JSON.stringify(VALID_PLAN));
    plan.weeks[0].workouts[0].startTime = written;
    const result = validateAIPlanOutput(plan);
    expect(result.valid).toBe(true);
    expect(result.data?.weeks[0].workouts[0].startTime).toBe(normalised);
    expect(result.repairs.some((r) => r.path.endsWith(".startTime"))).toBe(true);
  });

  it("rejects a startTime that is not a clock time", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].startTime = "evening";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects an out-of-range startTime", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].startTime = "25:00";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("repairs a plannedDuration written as text", () => {
    const plan = JSON.parse(JSON.stringify(VALID_PLAN));
    plan.weeks[0].workouts[0].plannedDuration = "90 min";
    const result = validateAIPlanOutput(plan);
    expect(result.valid).toBe(true);
    expect(result.data?.weeks[0].workouts[0].plannedDuration).toBe(90);
    expect(result.repairs.some((r) => r.path.endsWith(".plannedDuration"))).toBe(true);
  });

  it("rejects a non-positive or prose plannedDuration rather than guessing", () => {
    for (const bogus of [0, -30, "about an hour and a half"]) {
      const bad = JSON.parse(JSON.stringify(VALID_PLAN));
      bad.weeks[0].workouts[0].plannedDuration = bogus;
      expect(validateAIPlanOutput(bad).valid).toBe(false);
    }
  });

  it("carries startTime and plannedDuration through the phase format", () => {
    const result = validateAIPlanOutput({
      phases: [
        {
          phaseName: "Capacity",
          startWeekId: "2026-W25",
          endWeekId: "2026-W26",
          sessions: [
            {
              name: "Board",
              dayOfWeek: "Monday",
              startTime: "18:00",
              plannedDuration: 90,
              exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 5 } }],
            },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
    for (const week of result.data!.weeks) {
      expect(week.workouts[0].startTime).toBe("18:00");
      expect(week.workouts[0].plannedDuration).toBe(90);
    }
  });

  it("rejects an invalid dayOfWeek value", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].dayOfWeek = "Funday";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects when a value object is itself the wrong type", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values = "duration 30 sets 5";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("accepts an optional categoryName on an exercise", () => {
    const withCategory = JSON.parse(JSON.stringify(VALID_PLAN));
    withCategory.weeks[0].workouts[0].exercises[0].categoryName = "Fingers";
    const result = validateAIPlanOutput(withCategory);
    expect(result.valid).toBe(true);
    expect(result.data?.weeks[0].workouts[0].exercises[0].categoryName).toBe("Fingers");
  });

  it("leaves categoryName undefined when omitted", () => {
    const result = validateAIPlanOutput(VALID_PLAN);
    expect(result.data?.weeks[0].workouts[0].exercises[0].categoryName).toBeUndefined();
  });

  it("rejects a non-string categoryName", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].categoryName = 42;
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("collects every issue in the document, not just the first", () => {
    const bad = {
      weeks: [
        { phaseName: "", workouts: "not-an-array" },
        { weekId: "2026-W26", phaseName: "Strength", workouts: [{ exercises: [{ values: { sets: "many" } }] }] },
      ],
    };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(2);
  });
});

describe("parseAIPlanOutput (JSON.parse + validate)", () => {
  it("parses and validates well-formed JSON text", () => {
    const result = parseAIPlanOutput(JSON.stringify(VALID_PLAN));
    expect(result.valid).toBe(true);
  });

  it("rejects garbage non-JSON text without throwing", () => {
    expect(() => parseAIPlanOutput("Sure! Here's your plan: totally not json {{{")).not.toThrow();
    const result = parseAIPlanOutput("Sure! Here's your plan: totally not json {{{");
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
    expect(result.issues[0].message).toMatch(/Could not parse as JSON/);
  });

  it("rejects empty input", () => {
    const result = parseAIPlanOutput("");
    expect(result.valid).toBe(false);
  });

  it("rejects truncated/incomplete JSON", () => {
    const truncated = JSON.stringify(VALID_PLAN).slice(0, 40);
    const result = parseAIPlanOutput(truncated);
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });

  it("rejects JSON wrapped in markdown code fences (a common LLM habit)", () => {
    const fenced = "```json\n" + JSON.stringify(VALID_PLAN) + "\n```";
    const result = parseAIPlanOutput(fenced);
    // Deliberately not stripped automatically - surfaced as an error so the
    // user knows to paste raw JSON, rather than silently guessing at intent.
    expect(result.valid).toBe(false);
  });
});

describe("validateAIWorkoutLogOutput", () => {
  it("accepts a well-formed workout log", () => {
    const result = validateAIWorkoutLogOutput(VALID_LOG);
    expect(result.valid).toBe(true);
    expect(result.data?.workouts[0].exercises[0].values.climbingStyle).toEqual(["Power"]);
  });

  it("accepts a workout log with no date", () => {
    const result = validateAIWorkoutLogOutput({ workouts: [{ exercises: [{ exerciseTypeName: "Campus Board" }] }] });
    expect(result.valid).toBe(true);
    expect(result.data?.workouts[0].date).toBeUndefined();
  });

  it("rejects an invalid date string", () => {
    const bad = { workouts: [{ date: "not a date", exercises: [{ exerciseTypeName: "Campus Board" }] }] };
    expect(validateAIWorkoutLogOutput(bad).valid).toBe(false);
  });

  it("rejects a missing workouts array", () => {
    expect(validateAIWorkoutLogOutput({}).valid).toBe(false);
  });

  it("rejects an exercise missing exerciseTypeName", () => {
    const bad = { workouts: [{ exercises: [{ values: { duration: 10 } }] }] };
    expect(validateAIWorkoutLogOutput(bad).valid).toBe(false);
  });
});

describe("parseAIWorkoutLogOutput (JSON.parse + validate)", () => {
  it("parses and validates well-formed JSON text", () => {
    expect(parseAIWorkoutLogOutput(JSON.stringify(VALID_LOG)).valid).toBe(true);
  });

  it("rejects garbage non-JSON text", () => {
    const result = parseAIWorkoutLogOutput("not json at all");
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });
});

/**
 * Regression suite built directly from the plan the user pasted on
 * 2026-09-21: a real 15-week plan from a frontier model that the old
 * validator rejected with ~170 errors, plus the mistakes it did NOT catch
 * and silently stored. Every case below is taken verbatim from that paste.
 */
describe("repairs the mistakes real AI plans actually make", () => {
  function planWithValues(values: Record<string, unknown>) {
    const plan = JSON.parse(JSON.stringify(VALID_PLAN));
    plan.weeks[0].workouts[0].exercises[0].values = values;
    return validateAIPlanOutput(plan);
  }
  function valuesOf(result: ReturnType<typeof validateAIPlanOutput>) {
    return result.data!.weeks[0].workouts[0].exercises[0].values;
  }

  it('splits a compound mobilityType ("Shoulders and Wrists")', () => {
    const result = planWithValues({ mobilityType: "Shoulders and Wrists" });
    expect(result.valid).toBe(true);
    expect(valuesOf(result).mobilityType).toEqual(["Shoulders", "Wrists"]);
  });

  it("keeps the legal part of a compound climbingStyle and rescues the rest", () => {
    const result = planWithValues({ climbingStyle: "Vertical and slab, footwork focus" });
    expect(result.valid).toBe(true);
    const values = valuesOf(result);
    expect(values.climbingStyle).toEqual(["Slab"]);
    expect(values.notes).toContain("Vertical");
    expect(values.notes).toContain("footwork focus");
  });

  it("rescues a climbingStyle with no legal counterpart instead of inventing one", () => {
    const result = planWithValues({ climbingStyle: "Steep and compression" });
    expect(result.valid).toBe(true);
    const values = valuesOf(result);
    expect(values.climbingStyle).toBeUndefined();
    expect(values.notes).toContain("Steep");
  });

  it('corrects "Kilter" to the real board type "Kilterboard"', () => {
    const result = planWithValues({ boardType: "Kilter" });
    expect(result.valid).toBe(true);
    expect(valuesOf(result).boardType).toBe("Kilterboard");
  });

  // Previously silent corruption: the old validator type-checked these as
  // "string" and stored them, leaving values nothing in the app can render.
  it("does not store a campusType outside the two legal protocols", () => {
    const result = planWithValues({ campusType: "Max Ladders" });
    expect(result.valid).toBe(true);
    const values = valuesOf(result);
    expect(values.campusType).toBeUndefined();
    expect(values.notes).toContain("Max Ladders");
  });

  it("does not map a generic campus ladder onto One Arm Ladders", () => {
    expect(valuesOf(planWithValues({ campusType: "Ladders" })).campusType).toBeUndefined();
  });

  it("does not store a climbing grade in routeDifficulty", () => {
    const result = planWithValues({ routeDifficulty: "6B+" });
    expect(result.valid).toBe(true);
    const values = valuesOf(result);
    expect(values.routeDifficulty).toBeUndefined();
    expect(values.notes).toContain("6B+");
  });

  // Previously silent data loss: every "restTime" the model emitted was
  // dropped, because unknown keys are (deliberately) ignored.
  it('reads "restTime" as the real field timeBetweenSets', () => {
    const result = planWithValues({ restTime: 180 });
    expect(result.valid).toBe(true);
    expect(valuesOf(result).timeBetweenSets).toBe(180);
    expect(result.repairs.some((i) => i.path.endsWith("restTime"))).toBe(true);
  });

  it("prefers the canonical field when both spellings are present", () => {
    expect(valuesOf(planWithValues({ timeBetweenSets: 120, restTime: 180 })).timeBetweenSets).toBe(120);
  });

  it('reads a unit-suffixed number ("45kg") as a number', () => {
    expect(valuesOf(planWithValues({ weight: "45kg" })).weight).toBe(45);
  });

  it("does not mine a number out of prose", () => {
    const result = planWithValues({ cadence: "Continuous, 1 problem every 3-4 min" });
    const values = valuesOf(result);
    expect(values.cadence).toBeUndefined();
    expect(values.notes).toContain("Continuous");
  });

  it("appends rescued text to an existing note rather than replacing it", () => {
    const values = valuesOf(planWithValues({ notes: "Keep it strict.", cadence: "Moderate" }));
    expect(values.notes).toContain("Keep it strict.");
    expect(values.notes).toContain("Moderate");
  });

  it("still rejects input whose JSON type is flatly wrong", () => {
    const result = planWithValues({ sets: { from: 3, to: 5 } });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("values.sets"))).toBe(true);
  });
});

describe("validateAIPlanOutput - phase format", () => {
  const PHASE_PLAN = {
    phases: [
      {
        phaseName: "Capacity",
        startWeekId: "2026-W25",
        endWeekId: "2026-W27",
        sessions: [
          { name: "Board", dayOfWeek: "Monday", exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 5 } }] },
          { name: "Volume", dayOfWeek: "Friday", exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 3 } }] },
        ],
      },
      { phaseName: "Deload", startWeekId: "2026-W28", endWeekId: "2026-W28", sessions: [] },
    ],
  };

  it("expands each phase's sessions across every week it covers", () => {
    const result = validateAIPlanOutput(PHASE_PLAN);
    expect(result.valid).toBe(true);
    expect(result.data!.format).toBe("phase");
    expect(result.data!.weeks.map((w) => w.weekId)).toEqual(["2026-W25", "2026-W26", "2026-W27", "2026-W28"]);
    expect(result.data!.weeks[0].workouts).toHaveLength(2);
    expect(result.data!.weeks[0].phaseName).toBe("Capacity");
    expect(result.data!.weeks[3].workouts).toEqual([]);
  });

  it("gives each expanded week its own exercise objects", () => {
    const weeks = validateAIPlanOutput(PHASE_PLAN).data!.weeks;
    expect(weeks[0].workouts[0].exercises[0]).not.toBe(weeks[1].workouts[0].exercises[0]);
    expect(weeks[0].workouts[0].exercises[0].values).not.toBe(weeks[1].workouts[0].exercises[0].values);
  });

  it("tags the weekly format too", () => {
    expect(validateAIPlanOutput(VALID_PLAN).data!.format).toBe("weekly");
  });

  it("rejects a phase whose end week precedes its start week", () => {
    const bad = JSON.parse(JSON.stringify(PHASE_PLAN));
    bad.phases[0].endWeekId = "2026-W20";
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("endWeekId"))).toBe(true);
  });

  it("rejects a malformed week id", () => {
    const bad = JSON.parse(JSON.stringify(PHASE_PLAN));
    bad.phases[0].startWeekId = "June";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a document carrying both phases and weeks", () => {
    expect(validateAIPlanOutput({ ...PHASE_PLAN, weeks: [] }).valid).toBe(false);
  });

  it('accepts "workouts" as a synonym for "sessions"', () => {
    const renamed = { phases: [{ ...PHASE_PLAN.phases[0], sessions: undefined, workouts: PHASE_PLAN.phases[0].sessions }] };
    const result = validateAIPlanOutput(renamed);
    expect(result.valid).toBe(true);
    expect(result.data!.weeks[0].workouts).toHaveLength(2);
  });
});

/**
 * The complete corpus of malformed values from the user's pasted 15-week
 * plan - every distinct one named in its ~170 validation errors, plus the
 * four the old validator accepted and stored as unrenderable garbage. The
 * whole plan must import, and nothing may be invented in the process.
 */
describe("the full corpus from the rejected 15-week plan", () => {
  const CADENCE_PROSE = [
    "Continuous, 1 problem every 3-4 min", "Warm-up pyramid", "Moderate", "4x4 blocks",
    "Low volume, high quality", "Continuous", "Thorough warm-up", "Relaxed", "Flash mileage",
    "Projecting", "Long warm-up, add some dynamic moves", "Long warm-up", "Limit projecting",
    "Project focus", "Warm-up", "Relaxed, flash only", "Flash and quick sends",
  ];
  const CLIMBING_STYLE_PROSE = [
    "Vertical and slab, footwork focus", "Mixed", "Steep and compression", "Performance",
    "Slab and technical vertical", "Overhang and compression", "Technical, weakest styles",
    "Steep", "Movement quality, no falls", "Onsight and flash", "Steep gym boulders",
    "Slab, coordination, compression", "Weakest styles", "Movement quality",
    "Mixed and technical", "Steep and powerful", "Performance outdoor",
  ];
  const MOBILITY_PROSE = [
    "Shoulders and Wrists", "Hips and Hamstrings", "Full Body", "Shoulders", "Shoulders and Hips",
  ];

  const ALLOWED_CLIMBING_STYLES = ["Slab", "Coordination", "Power", "Board"];
  const ALLOWED_MOBILITY = ["Hamstrings", "Shoulders", "Hips", "Spine", "Ankles", "Wrists"];

  function exercisesFor(values: Record<string, unknown>[]) {
    return values.map((v) => ({ exerciseTypeName: "Free Bouldering", values: v }));
  }

  it("imports every malformed value without a single fatal error", () => {
    const plan = {
      weeks: [
        {
          weekId: "2026-W39",
          phaseName: "Capacity",
          workouts: [
            { name: "cadence", dayOfWeek: "Monday", exercises: exercisesFor(CADENCE_PROSE.map((c) => ({ cadence: c }))) },
            { name: "style", dayOfWeek: "Tuesday", exercises: exercisesFor(CLIMBING_STYLE_PROSE.map((c) => ({ climbingStyle: c }))) },
            { name: "mobility", dayOfWeek: "Wednesday", exercises: exercisesFor(MOBILITY_PROSE.map((m) => ({ mobilityType: m }))) },
            {
              name: "silently corrupted before",
              dayOfWeek: "Friday",
              exercises: exercisesFor([
                { boardType: "Kilter", boardAngle: 40 },
                { campusType: "Ladders" },
                { campusType: "Ladders and Bumps" },
                { campusType: "Max Ladders" },
                { routeDifficulty: "6B" },
                { routeDifficulty: "6B+" },
                { sets: 5, reps: 6, timeOn: 7, timeOff: 3, restTime: 180, weight: 10 },
              ]),
            },
          ],
        },
      ],
    };

    const result = validateAIPlanOutput(plan);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(0);
  });

  it("never stores a value outside the schema's allowed list", () => {
    const result = validateAIPlanOutput({
      weeks: [
        {
          weekId: "2026-W39",
          phaseName: "Capacity",
          workouts: [
            { exercises: exercisesFor(CLIMBING_STYLE_PROSE.map((c) => ({ climbingStyle: c }))) },
            { exercises: exercisesFor(MOBILITY_PROSE.map((m) => ({ mobilityType: m }))) },
            { exercises: exercisesFor(CADENCE_PROSE.map((c) => ({ cadence: c }))) },
          ],
        },
      ],
    });

    for (const workout of result.data!.weeks[0].workouts) {
      for (const exercise of workout.exercises) {
        const { climbingStyle, mobilityType, cadence } = exercise.values;
        for (const style of climbingStyle ?? []) expect(ALLOWED_CLIMBING_STYLES).toContain(style);
        for (const area of mobilityType ?? []) expect(ALLOWED_MOBILITY).toContain(area);
        if (cadence !== undefined) expect(typeof cadence).toBe("number");
      }
    }
  });

  it("loses no coaching text - every rescued value survives in notes", () => {
    const result = validateAIPlanOutput({
      weeks: [
        {
          weekId: "2026-W39",
          phaseName: "Capacity",
          workouts: [{ exercises: exercisesFor(CADENCE_PROSE.map((c) => ({ cadence: c }))) }],
        },
      ],
    });
    result.data!.weeks[0].workouts[0].exercises.forEach((exercise, i) => {
      expect(exercise.values.notes).toContain(CADENCE_PROSE[i]);
    });
  });
});

/**
 * The prompt is the only thing standing between the model and a malformed
 * document, so these assert it actually states every rule the validator
 * enforces. Generated from EXERCISE_VALUE_SPEC, so a field added later
 * without prompt text fails here rather than silently at import time.
 */
describe("AI prompt completeness", () => {
  const PROMPTS = {
    changeSet: AI_CHANGESET_INSTRUCTIONS,
    workoutLog: AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS,
  };

  for (const [name, prompt] of Object.entries(PROMPTS)) {
    describe(name, () => {
      it("documents every field the validator accepts", () => {
        for (const field of EXERCISE_VALUE_FIELD_NAMES) {
          expect(prompt, `prompt never mentions "${field}"`).toContain(field);
        }
      });

      it("lists every allowed value of every enum field", () => {
        for (const field of EXERCISE_VALUE_FIELD_NAMES) {
          const spec = EXERCISE_VALUE_SPEC[field];
          if (!spec.enum) continue;
          for (const value of spec.enum) {
            expect(prompt, `prompt never lists "${value}" for ${field}`).toContain(`"${value}"`);
          }
        }
      });

      it("states the type of every array field", () => {
        for (const field of EXERCISE_VALUE_FIELD_NAMES) {
          if (EXERCISE_VALUE_SPEC[field].type !== "string[]") continue;
          expect(prompt, `${field} not documented as an array`).toContain(`${field} (array of strings`);
        }
      });

      it("warns against the mistakes that actually broke a real import", () => {
        expect(prompt).toContain("restTime");
        expect(prompt).toMatch(/never put prose in a numeric field/i);
        expect(prompt).toMatch(/bare JSON number/i);
        expect(prompt).toMatch(/Kilterboard/);
      });
    });
  }
});

describe("notes in the plan contract", () => {
  const phasePlan = (extra: Record<string, unknown>) => ({
    phases: [
      {
        phaseName: "Capacity",
        startWeekId: "2026-W25",
        endWeekId: "2026-W27",
        sessions: [{ name: "Board", dayOfWeek: "Monday", exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 5 } }] }],
        ...extra,
      },
    ],
  });

  it("carries a phase's notes onto every week it expands into, as the block note", () => {
    const result = validateAIPlanOutput(phasePlan({ notes: "Build volume, keep intensity moderate" }));
    expect(result.valid).toBe(true);
    expect(result.data!.phases![0].notes).toBe("Build volume, keep intensity moderate");
    expect(result.data!.weeks.map((w) => w.blockNotes)).toEqual([
      "Build volume, keep intensity moderate",
      "Build volume, keep intensity moderate",
      "Build volume, keep intensity moderate",
    ]);
  });

  it("puts weekNotes on the matching expanded week only", () => {
    const result = validateAIPlanOutput(phasePlan({ weekNotes: { "2026-W27": "Test max hang at the end of the week" } }));
    expect(result.valid).toBe(true);
    expect(result.data!.weeks.map((w) => w.notes)).toEqual([undefined, undefined, "Test max hang at the end of the week"]);
  });

  it("drops a weekNotes entry outside the phase's weeks as a repair, not an error", () => {
    const result = validateAIPlanOutput(phasePlan({ weekNotes: { "2026-W30": "Outside", "June": "Bad id", "2026-W26": "Inside" } }));
    expect(result.valid).toBe(true);
    expect(result.data!.weeks.map((w) => w.notes)).toEqual([undefined, "Inside", undefined]);
    expect(result.repairs.filter((r) => r.path.includes("weekNotes"))).toHaveLength(2);
  });

  it("ignores blank notes and rejects nothing over a non-string note", () => {
    const result = validateAIPlanOutput(phasePlan({ notes: "  ", weekNotes: { "2026-W25": 42 } }));
    expect(result.valid).toBe(true);
    expect(result.data!.phases![0].notes).toBeUndefined();
    expect(result.data!.weeks[0].notes).toBeUndefined();
  });

  it("reads a week's notes in the weekly format", () => {
    const result = validateAIPlanOutput({
      weeks: [{ weekId: "2026-W25", phaseName: "Capacity", notes: "Travel week - hotel gym only", workouts: [] }],
    });
    expect(result.valid).toBe(true);
    expect(result.data!.weeks[0].notes).toBe("Travel week - hotel gym only");
  });
});
