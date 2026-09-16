import { describe, expect, it } from "vitest";
import { INTEGRATIONS } from "../integrations";
import { expiryLabel, keyExpiry, parseIssuedAt, RENEW_SOON_DAYS, type KeyLifetime } from "../key-expiry";

const AHREFS: KeyLifetime = INTEGRATIONS.ahrefs.keyLifetime!;
const NOW = new Date("2026-09-16T12:34:56Z");

describe("発行日の読み取り", () => {
  it("YYYY-MM-DD だけを受け付ける", () => {
    expect(parseIssuedAt("2026-09-16")?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(parseIssuedAt(" 2026-09-16 ")?.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(parseIssuedAt("2026/09/16")).toBeNull();
    expect(parseIssuedAt("2026-09-16T00:00:00Z")).toBeNull();
    expect(parseIssuedAt("")).toBeNull();
    expect(parseIssuedAt(undefined)).toBeNull();
  });

  it("存在しない日付は弾く", () => {
    expect(parseIssuedAt("2026-02-31")).toBeNull();
    expect(parseIssuedAt("2026-13-01")).toBeNull();
  });
});

describe("Ahrefs のキー（1 年）の残り日数", () => {
  it("設定値は 365 日で、環境変数名が決まっている", () => {
    expect(AHREFS.days).toBe(365);
    expect(AHREFS.issuedAtEnv).toBe("AHREFS_API_KEY_ISSUED_AT");
  });

  it("作った当日は残り 365 日", () => {
    const e = keyExpiry("2026-09-16", AHREFS, NOW);
    expect(e.daysLeft).toBe(365);
    expect(e.expiresAt).toBe("2027-09-16");
    expect(e.level).toBe("ok");
  });

  it("30 日を切ると soon になる", () => {
    const e = keyExpiry("2025-09-16", AHREFS, NOW); // 失効 2026-09-16 = 今日
    expect(e.daysLeft).toBe(0);
    expect(e.level).toBe("soon");
    const before = keyExpiry("2025-10-15", AHREFS, NOW); // 残り 29 日
    expect(before.daysLeft).toBe(RENEW_SOON_DAYS - 1);
    expect(before.level).toBe("soon");
  });

  it("境界: ちょうど 30 日は soon、31 日は ok", () => {
    expect(keyExpiry("2025-10-16", AHREFS, NOW).daysLeft).toBe(30);
    expect(keyExpiry("2025-10-16", AHREFS, NOW).level).toBe("soon");
    expect(keyExpiry("2025-10-17", AHREFS, NOW).level).toBe("ok");
  });

  it("過ぎていれば expired（負の残り日数）", () => {
    const e = keyExpiry("2025-01-01", AHREFS, NOW);
    expect(e.level).toBe("expired");
    expect(e.daysLeft).toBeLessThan(0);
    expect(expiryLabel(e)).toContain("期限切れ");
  });

  it("発行日が無ければ unknown（判定しない）", () => {
    const e = keyExpiry(null, AHREFS, NOW);
    expect(e).toEqual({ issuedAt: null, expiresAt: null, daysLeft: null, level: "unknown" });
    expect(expiryLabel(e)).toBe("発行日が未設定");
  });

  it("時刻で 1 日ずれない（同じ日ならどの時刻でも同じ）", () => {
    const morning = keyExpiry("2026-09-16", AHREFS, new Date("2026-09-16T00:00:01Z"));
    const night = keyExpiry("2026-09-16", AHREFS, new Date("2026-09-16T23:59:59Z"));
    expect(morning.daysLeft).toBe(night.daysLeft);
  });
});
