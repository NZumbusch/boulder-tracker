import { describe, expect, it } from "vitest";
import { parseCoordinates, cragLocationsOf, homeLocationOf, placeByName, placeLine, renamedPlace, validatePlace, validatePlaces, withCrags, withHome, type Place } from "./places";

const crag = (name: string, extra: Partial<Place> = {}): Place => ({ name, kind: "crag", latitude: 47, longitude: 8, ...extra });

describe("validatePlace", () => {
  it("needs a name; keeps what is valid, drops the rest", () => {
    expect(validatePlace({ name: "  " })).toBeNull();
    expect(validatePlace(null)).toBeNull();
    expect(validatePlace({ name: " Steinbock ", kind: "gym", latitude: 47.6, longitude: 9.1, price: " CHF 22 ", hours: "", notes: "Code 1234" }))
      .toEqual({ name: "Steinbock", kind: "gym", latitude: 47.6, longitude: 9.1, price: "CHF 22", notes: "Code 1234" });
  });
  it("drops lone or impossible coordinates and turns an unknown kind into other", () => {
    expect(validatePlace({ name: "A", kind: "cave", latitude: 47 })).toEqual({ name: "A", kind: "other" });
    expect(validatePlace({ name: "A", latitude: 91, longitude: 8 })).toEqual({ name: "A", kind: "other" });
  });
});

describe("validatePlaces", () => {
  it("builds the list from the old home and crags, once", () => {
    const places = validatePlaces(undefined, { homeLocation: { name: "Luzern", latitude: 47.05, longitude: 8.3 }, crags: [{ name: "Brione", latitude: 46.3, longitude: 8.8 }, { name: "bad" }] });
    expect(places).toEqual([
      { name: "Luzern", kind: "home", latitude: 47.05, longitude: 8.3 },
      { name: "Brione", kind: "crag", latitude: 46.3, longitude: 8.8 },
    ]);
  });
  it("reads the single trip location of the oldest data as a crag", () => {
    expect(validatePlaces(undefined, { tripLocation: { name: "Fontainebleau", latitude: 48.4, longitude: 2.7 } })).toEqual([{ name: "Fontainebleau", kind: "crag", latitude: 48.4, longitude: 2.7 }]);
  });
  it("one place per name and one home; stored places win over the old keys", () => {
    const places = validatePlaces([{ name: "A", kind: "home" }, { name: "a", kind: "crag" }, { name: "B", kind: "home" }], { homeLocation: { name: "Old", latitude: 1, longitude: 1 } });
    expect(places.map((p) => [p.name, p.kind])).toEqual([["A", "home"], ["B", "other"]]);
  });
});

describe("the weather's view of the places", () => {
  const places: Place[] = [{ name: "Home", kind: "home", latitude: 47, longitude: 8 }, crag("Brione"), { name: "Gym", kind: "gym" }, crag("Ticino"), { name: "NoCoords", kind: "crag" }];
  it("gives the home and the crags that have coordinates, in order", () => {
    expect(homeLocationOf(places)).toEqual({ name: "Home", latitude: 47, longitude: 8 });
    expect(cragLocationsOf(places).map((c) => c.name)).toEqual(["Brione", "Ticino"]);
    expect(homeLocationOf([{ name: "Home", kind: "home" }])).toBeNull();
  });
  it("finds a place by name ignoring case", () => {
    expect(placeByName(places, " brione ")?.name).toBe("Brione");
    expect(placeByName(places, "nowhere")).toBeUndefined();
    expect(placeByName(places, undefined)).toBeUndefined();
  });
});

describe("changing the list through the weather's setters", () => {
  it("setting the home keeps what was written about it, and clearing it keeps the notes", () => {
    const start: Place[] = [{ name: "Home", kind: "home", latitude: 1, longitude: 2, notes: "Hangboard in the hall" }, crag("Brione")];
    const moved = withHome(start, { name: "Home", latitude: 47, longitude: 8 });
    expect(moved[0]).toEqual({ name: "Home", kind: "home", latitude: 47, longitude: 8, notes: "Hangboard in the hall" });
    expect(withHome(start, null)).toEqual([{ name: "Home", kind: "home", notes: "Hangboard in the hall" }, crag("Brione")]);
    expect(withHome([{ name: "Home", kind: "home", latitude: 1, longitude: 2 }], null)).toEqual([]);
  });
  it("replacing the crags keeps the notes of those that stay and the other places where they are", () => {
    const start: Place[] = [crag("A", { price: "free" }), { name: "Gym", kind: "gym" }, crag("B")];
    const next = withCrags(start, [{ name: "B", latitude: 1, longitude: 1 }, { name: "A", latitude: 2, longitude: 2 }, { name: "C", latitude: 3, longitude: 3 }]);
    expect(next.map((p) => p.name)).toEqual(["B", "Gym", "A", "C"]);
    expect(next.find((p) => p.name === "A")).toMatchObject({ price: "free", latitude: 2 });
    expect(withCrags(start, []).map((p) => p.name)).toEqual(["Gym"]);
  });
});

describe("renamedPlace", () => {
  it("renames, refuses an empty or taken name", () => {
    const list: Place[] = [crag("A"), crag("B")];
    expect(renamedPlace(list, "A", " Alpha ")?.map((p) => p.name)).toEqual(["Alpha", "B"]);
    expect(renamedPlace(list, "A", "b")).toBeNull();
    expect(renamedPlace(list, "A", "  ")).toBeNull();
    expect(renamedPlace(list, "A", "a")?.map((p) => p.name)).toEqual(["a", "B"]);
  });
});

describe("placeLine", () => {
  it("is the kind, the price and the hours", () => {
    expect(placeLine({ name: "G", kind: "gym", price: "CHF 22", hours: "9-22" })).toBe("Gym \u00b7 CHF 22 \u00b7 9-22");
    expect(placeLine({ name: "G", kind: "crag" })).toBe("Crag");
  });
});

describe("parseCoordinates", () => {
  it("reads what a map app copies", () => {
    expect(parseCoordinates("47.0502, 8.3093")).toEqual({ latitude: 47.0502, longitude: 8.3093 });
    expect(parseCoordinates(" 47.0502 8.3093 ")).toEqual({ latitude: 47.0502, longitude: 8.3093 });
    expect(parseCoordinates("-33.8688, 151.2093")).toEqual({ latitude: -33.8688, longitude: 151.2093 });
    expect(parseCoordinates("47,0502; 8,3093")).toEqual({ latitude: 47.0502, longitude: 8.3093 });
  });
  it("reads hemisphere letters", () => {
    expect(parseCoordinates("33.8688\u00b0 S, 151.2093\u00b0 E")).toEqual({ latitude: -33.8688, longitude: 151.2093 });
    expect(parseCoordinates("40.7 N 74.0 W")).toEqual({ latitude: 40.7, longitude: -74 });
  });
  it("refuses anything else", () => {
    expect(parseCoordinates("Luzern")).toBeNull();
    expect(parseCoordinates("47.0")).toBeNull();
    expect(parseCoordinates("1, 2, 3")).toBeNull();
    expect(parseCoordinates("95, 8")).toBeNull();
    expect(parseCoordinates("47, 181")).toBeNull();
  });
});
