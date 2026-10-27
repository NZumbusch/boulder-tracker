import { describe, expect, it } from "vitest";
import { StravaError, exchangeCode, fetchActivities, refreshTokens, type Http, type HttpRequest } from "./stravaClient";

const cred = { clientId: "1", clientSecret: "s" };
const fresh = { accessToken: "a1", refreshToken: "r1", expiresAt: 10_000 };
const run = (id: number, day: number) => ({ id, type: "Run", start_date: `2026-10-${String(day).padStart(2, "0")}T08:00:00Z`, elapsed_time: 600 });

function server(handler: (req: HttpRequest) => { status: number; data: unknown }) {
  const calls: HttpRequest[] = [];
  const http: Http = async (req) => { calls.push(req); return handler(req); };
  return { http, calls };
}

describe("exchangeCode / refreshTokens", () => {
  it("returns the tokens and the athlete's name", async () => {
    const { http, calls } = server(() => ({ status: 200, data: { access_token: "a", refresh_token: "r", expires_at: 99, athlete: { firstname: "Ada", lastname: "L" } } }));
    expect(await exchangeCode(http, cred, "code")).toEqual({ tokens: { accessToken: "a", refreshToken: "r", expiresAt: 99 }, athlete: "Ada L" });
    expect(calls[0].form).toMatchObject({ code: "code", grant_type: "authorization_code", client_secret: "s" });
  });
  it("calls a refused login a credentials problem and a refused refresh a reason to reconnect", async () => {
    const { http } = server(() => ({ status: 401, data: {} }));
    await expect(exchangeCode(http, cred, "c")).rejects.toMatchObject({ code: "bad-credentials" });
    await expect(refreshTokens(http, cred, "r")).rejects.toMatchObject({ code: "reconnect" });
  });
  it("reports an unreachable Strava", async () => {
    const http: Http = async () => { throw new Error("offline"); };
    await expect(exchangeCode(http, cred, "c")).rejects.toMatchObject({ code: "network" });
  });
});

describe("fetchActivities", () => {
  it("renews an expired token and uses the rotated one", async () => {
    const { http, calls } = server((req) =>
      req.url.includes("/oauth/token")
        ? { status: 200, data: { access_token: "a2", refresh_token: "r2", expires_at: 50_000 } }
        : { status: 200, data: [run(1, 1)] });
    const out = await fetchActivities(http, cred, fresh, 0, 20_000);
    expect(out.tokens).toEqual({ accessToken: "a2", refreshToken: "r2", expiresAt: 50_000 });
    expect(calls[1].headers?.Authorization).toBe("Bearer a2");
  });
  it("keeps a token that is still good and sends `after`", async () => {
    const { http, calls } = server(() => ({ status: 200, data: [] }));
    const out = await fetchActivities(http, cred, fresh, 1234.9, 100);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get("after")).toBe("1234");
    expect(out.tokens).toBe(fresh);
  });
  it("reads every page, oldest first, and counts what it could not read", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => run(i + 1, 28));
    const { http, calls } = server((req) => {
      const page = Number(new URL(req.url).searchParams.get("page"));
      return { status: 200, data: page === 1 ? page1 : [run(500, 2), { id: 501 }] };
    });
    const out = await fetchActivities(http, cred, { ...fresh, expiresAt: 99_999 }, 0, 100);
    expect(calls).toHaveLength(2);
    expect(out.activities).toHaveLength(101);
    expect(out.activities[0].id).toBe("strava-500");
    expect(out.unreadable).toBe(1);
  });
  it("maps 401 to reconnect and 429 to rate-limited", async () => {
    await expect(fetchActivities(server(() => ({ status: 401, data: {} })).http, cred, { ...fresh, expiresAt: 99_999 }, 0, 0)).rejects.toMatchObject({ code: "reconnect" });
    await expect(fetchActivities(server(() => ({ status: 429, data: {} })).http, cred, { ...fresh, expiresAt: 99_999 }, 0, 0)).rejects.toBeInstanceOf(StravaError);
  });
});
