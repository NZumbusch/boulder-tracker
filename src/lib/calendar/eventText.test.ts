import { describe, expect, it } from "vitest";
import { formatEventWhen, mapsUrl } from "./eventText";

const local = (d: number, h: number, m = 0, month = 9) => new Date(2026, month, d, h, m).getTime();

describe("formatEventWhen", () => {
  it("a timed event on one day", () => {
    expect(formatEventWhen({ allDay: false, begin: local(14, 18, 30), end: local(14, 19, 30) }, "en-US")).toBe("Wed, Oct 14 \u00b7 18:30 \u2013 19:30");
  });
  it("one that runs past midnight names both days", () => {
    expect(formatEventWhen({ allDay: false, begin: local(14, 22), end: local(15, 1, 30) }, "en-US")).toBe("Wed, Oct 14, 22:00 \u2013 Thu, Oct 15, 01:30");
  });
  it("all-day: one date, or the range (the end is exclusive, in UTC)", () => {
    expect(formatEventWhen({ allDay: true, begin: Date.UTC(2026, 9, 14), end: Date.UTC(2026, 9, 15) }, "en-US")).toBe("Wed, Oct 14 \u00b7 all day");
    expect(formatEventWhen({ allDay: true, begin: Date.UTC(2026, 9, 14), end: Date.UTC(2026, 9, 17) }, "en-US")).toBe("Wed, Oct 14 \u2013 Fri, Oct 16 \u00b7 all day");
  });
});

describe("mapsUrl", () => {
  it("encodes the place", () => {
    expect(mapsUrl("Raum 555, Kriens")).toBe("https://www.google.com/maps/search/?api=1&query=Raum%20555%2C%20Kriens");
  });
});
