/**
 * 無料診断の固定リンクと Cookie（純粋な部分。利用者の決定 2026-10-03）。
 */
import { describe, expect, it } from "vitest";
import { FREE_ENTRY_PATH, FREE_SESSION_COOKIE, FREE_SESSION_DAYS, FREE_SESSION_VALUE, freeSessionExpiry, isFreeSessionValue } from "../session-rules";

describe("固定リンクと Cookie", () => {
  it("定数（パス・名前・日数）", () => {
    expect(FREE_ENTRY_PATH).toBe("/free");
    expect(FREE_SESSION_COOKIE).toBe("free_diagnosis");
    expect(FREE_SESSION_DAYS).toBe(30);
    expect(freeSessionExpiry(1_000)).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
  });

  it("Cookie の値は印そのものだけを通す", () => {
    expect(isFreeSessionValue(FREE_SESSION_VALUE)).toBe(true);
    for (const bad of [undefined, null, "", "0", "11", " 1"]) expect(isFreeSessionValue(bad)).toBe(false);
  });
});
