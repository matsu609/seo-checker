/**
 * POST /api/meo/report の順番（2026-09-23）。
 *
 * 無料診断を使い切った人が押しても、全員で分け合う枠（IP ごと 10 回 / 時・全体 500 回 / 日）を減らさない。
 * 以前は枠を取ってから本人の回数を見ていたので、使い切った人が押すたびに全体の枠だけが減り、
 * ほかの見込み客が「本日の枠に達しました」で締め出されていた。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const userMock = vi.fn();
const updateUserMetadata = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => userMock(),
  clerkClient: async () => ({ users: { getUser: async () => userMock(), updateUserMetadata: (...a: unknown[]) => updateUserMetadata(...a) } }),
}));

const getPlaceCached = vi.fn();
vi.mock("@/lib/maps/fetch", () => ({
  peekPlaceCached: () => null,
  getPlaceCached: (...a: unknown[]) => getPlaceCached(...a),
}));

import { dailyCount, resetFreeLimits } from "@/lib/free/ratelimit";

function prospect(freeRuns: number) {
  return {
    id: "user_p",
    publicMetadata: {},
    privateMetadata: { freeRuns },
    unsafeMetadata: {},
    emailAddresses: [{ id: "e", emailAddress: "p@example.com", verification: { status: "verified" } }],
    primaryEmailAddressId: "e",
  };
}

function request(): Request {
  return new Request("http://localhost/api/meo/report", { method: "POST", body: JSON.stringify({ placeId: "ChIJabcdefghij12345" }) });
}

beforeEach(() => {
  resetFreeLimits();
  authMock.mockReset();
  userMock.mockReset();
  updateUserMetadata.mockReset();
  getPlaceCached.mockReset();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "key");
  vi.stubEnv("DEFAULT_PLAN", "free");
  vi.stubEnv("FREE_DIAGNOSIS_LIMIT", "2");
  authMock.mockResolvedValue({ userId: "user_p" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("無料 MEO 診断の報告書", () => {
  it("使い切った人は 402 で、全体の枠を減らさない", async () => {
    userMock.mockResolvedValue(prospect(2));
    const { POST } = await import("@/app/api/meo/report/route");
    for (let i = 0; i < 3; i++) {
      const res = await POST(request());
      expect(res.status).toBe(402);
    }
    expect(dailyCount("meo-report")).toBe(0);
    expect(getPlaceCached).not.toHaveBeenCalled();
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("残りがある人は枠を 1 つ取り、回数を 1 つ消費する（確かめた回数をそのまま使う）", async () => {
    userMock.mockResolvedValue(prospect(1));
    getPlaceCached.mockRejectedValue(new Error("テストでは Google に出ない"));
    const { POST } = await import("@/app/api/meo/report/route");
    await POST(request());
    expect(dailyCount("meo-report")).toBe(1);
    expect(updateUserMetadata).toHaveBeenCalledWith("user_p", { privateMetadata: { freeRuns: 2 } });
  });
});
