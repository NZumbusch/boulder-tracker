import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeCity, fetchWeatherSnapshot } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("geocodeCity", () => {
  it("returns an empty array for a blank query, without calling fetch", async () => {
    expect(await geocodeCity("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful response into GeocodeResult[]", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          { name: "Munich", admin1: "Bavaria", country_code: "DE", latitude: 48.1374, longitude: 11.5755 },
          { name: "Fontainebleau", country_code: "FR", latitude: 48.4042, longitude: 2.7017 },
        ],
      }),
    );

    const results = await geocodeCity("Munich");

    expect(results).toEqual([
      { name: "Munich, Bavaria", countryCode: "DE", latitude: 48.1374, longitude: 11.5755 },
      { name: "Fontainebleau", countryCode: "FR", latitude: 48.4042, longitude: 2.7017 },
    ]);
  });

  it("returns an empty array (never throws) on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(geocodeCity("Nowhere")).resolves.toEqual([]);
  });

  it("returns an empty array (never throws) when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(geocodeCity("Munich")).resolves.toEqual([]);
  });

  it("returns an empty array for an unexpected response shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: "not an array" }));
    await expect(geocodeCity("Munich")).resolves.toEqual([]);
  });
});

describe("fetchWeatherSnapshot", () => {
  /** Shaped exactly like a real Open-Meteo `current=`/`daily=` response. */
  const validBody = {
    current: {
      temperature_2m: 18.5,
      weather_code: 2,
      apparent_temperature: 16.9,
      relative_humidity_2m: 71,
      wind_speed_10m: 4.6,
      precipitation: 0,
      is_day: 1,
    },
    daily: {
      time: ["2026-09-18", "2026-09-19"],
      weather_code: [2, 61],
      temperature_2m_max: [22, 19],
      temperature_2m_min: [12, 11],
      precipitation_probability_max: [10, 80],
    },
  };

  it("maps a successful response into a WeatherSnapshot", async () => {
    fetchMock.mockResolvedValue(jsonResponse(validBody));

    const result = await fetchWeatherSnapshot(48.1374, 11.5755);

    expect(result).toEqual({
      currentTempC: 18.5,
      currentWeatherCode: 2,
      feelsLikeC: 16.9,
      humidityPercent: 71,
      windSpeedKmh: 4.6,
      precipitationMm: 0,
      isDay: true,
      daily: [
        { date: "2026-09-18", weatherCode: 2, tempMaxC: 22, tempMinC: 12, precipitationChance: 10 },
        { date: "2026-09-19", weatherCode: 61, tempMaxC: 19, tempMinC: 11, precipitationChance: 80 },
      ],
    });
  });

  it("asks for the fields it maps", async () => {
    fetchMock.mockResolvedValue(jsonResponse(validBody));
    await fetchWeatherSnapshot(1, 2);

    const url = String(fetchMock.mock.calls[0][0]);
    for (const field of [
      "temperature_2m", "apparent_temperature", "relative_humidity_2m",
      "wind_speed_10m", "precipitation", "weather_code", "is_day",
      "precipitation_probability_max",
    ]) {
      expect(url, `${field} is mapped but never requested`).toContain(field);
    }
  });

  it("reads is_day as a flag, including at night", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ...validBody,
      current: { ...validBody.current, is_day: 0 },
    }));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toMatchObject({ isDay: false });
  });

  it("still returns a snapshot when only the required fields are present", async () => {
    // Every extra is optional on purpose: snapshots are cached in
    // localStorage, so a partial or older-shaped response must degrade to
    // less detail rather than to no weather at all.
    fetchMock.mockResolvedValue(jsonResponse({
      current: { temperature_2m: 5, weather_code: 3 },
      daily: {
        time: ["2026-09-18"],
        weather_code: [3],
        temperature_2m_max: [7],
        temperature_2m_min: [2],
      },
    }));

    expect(await fetchWeatherSnapshot(0, 0)).toEqual({
      currentTempC: 5,
      currentWeatherCode: 3,
      feelsLikeC: undefined,
      humidityPercent: undefined,
      windSpeedKmh: undefined,
      precipitationMm: undefined,
      isDay: undefined,
      daily: [{ date: "2026-09-18", weatherCode: 3, tempMaxC: 7, tempMinC: 2, precipitationChance: undefined }],
    });
  });

  it("drops a malformed extra rather than passing NaN on", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ...validBody,
      current: { ...validBody.current, relative_humidity_2m: "71%", apparent_temperature: null },
    }));

    const result = await fetchWeatherSnapshot(0, 0);
    expect(result?.humidityPercent).toBeUndefined();
    expect(result?.feelsLikeC).toBeUndefined();
    expect(result?.currentTempC).toBe(18.5);
  });

  it("returns null (never throws) on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });

  it("returns null (never throws) when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });

  it("returns null for a response missing the fields it cannot do without", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ current: {} }));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });
});
