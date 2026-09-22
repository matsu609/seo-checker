import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientKeyOf,
  dailyCount,
  envInt,
  FAQ_AUDIT_PER_HOUR,
  FAQ_PROPOSE_DAILY_DEFAULT,
  FREE_FAQ_DAILY_DEFAULT,
  FREE_FAQ_PER_HOUR,
  resetFreeLimits,
  takeClientToken,
  takeDailyToken,
} from "../ratelimit";

beforeEach(() => resetFreeLimits());
afterEach(() => vi.unstubAllEnvs());

describe("クライアントごとの回数制限", () => {
  it("窓の中は limit 回まで。窓が過ぎればまた使える", () => {
    const rule = { windowMs: 1000, limit: 2 };
    expect(takeClientToken("t", "a", rule, 0)).toBe(true);
    expect(takeClientToken("t", "a", rule, 100)).toBe(true);
    expect(takeClientToken("t", "a", rule, 200)).toBe(false);
    // 別のクライアントは独立
    expect(takeClientToken("t", "b", rule, 200)).toBe(true);
    // 最初の 1 回が窓から外れたら 1 回ぶん空く
    expect(takeClientToken("t", "a", rule, 1001)).toBe(true);
    expect(takeClientToken("t", "a", rule, 1002)).toBe(false);
  });

  it("バケットの名前が違えば別に数える", () => {
    const rule = { windowMs: 1000, limit: 1 };
    expect(takeClientToken("search", "a", rule, 0)).toBe(true);
    expect(takeClientToken("report", "a", rule, 0)).toBe(true);
    expect(takeClientToken("search", "a", rule, 0)).toBe(false);
  });
});

describe("1 日の全体上限", () => {
  it("上限に達したら false。日付が変われば戻る", () => {
    const d1 = Date.UTC(2026, 8, 11, 10);
    expect(takeDailyToken("meo", 2, d1)).toBe(true);
    expect(takeDailyToken("meo", 2, d1)).toBe(true);
    expect(takeDailyToken("meo", 2, d1)).toBe(false);
    expect(dailyCount("meo", d1)).toBe(2);
    const d2 = Date.UTC(2026, 8, 12, 1);
    expect(takeDailyToken("meo", 2, d2)).toBe(true);
    expect(dailyCount("meo", d2)).toBe(1);
  });

  it("上限 0 なら常に拒否（無料枠を止めるスイッチ）", () => {
    expect(takeDailyToken("meo", 0, 0)).toBe(false);
  });
});

describe("補助", () => {
  it("クライアント識別子はプロキシの元 IP を優先", () => {
    const r = (h: Record<string, string>) => new Request("https://x.test/", { headers: h });
    expect(clientKeyOf(r({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientKeyOf(r({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKeyOf(r({}))).toBe("unknown");
  });

  it("環境変数の整数は不正なら既定", () => {
    vi.stubEnv("FREE_MEO_DAILY_LIMIT", "abc");
    expect(envInt("FREE_MEO_DAILY_LIMIT", 500)).toBe(500);
    vi.stubEnv("FREE_MEO_DAILY_LIMIT", "0");
    expect(envInt("FREE_MEO_DAILY_LIMIT", 500)).toBe(0);
    vi.stubEnv("FREE_MEO_DAILY_LIMIT", "1200");
    expect(envInt("FREE_MEO_DAILY_LIMIT", 500)).toBe(1200);
  });
});

/**
 * FAQ の生成の上限（利用者の指示 2026-09-22「FAQ の生成に上限を設けてください」）。
 * 値そのものを固定する。ゆるめ過ぎ / きつ過ぎの判断はここを見て話す。
 */
describe("FAQ 生成の上限", () => {
  it("決めた値: クイック診断は 1 人 1 時間に 10 回・全体 1 日 300 回", () => {
    expect(FREE_FAQ_PER_HOUR).toEqual({ windowMs: 60 * 60 * 1000, limit: 10 });
    expect(FREE_FAQ_DAILY_DEFAULT).toBe(300);
  });

  it("決めた値: FAQ 提案は全体 1 日 200 回、確認だけは 1 人 1 時間に 30 回", () => {
    expect(FAQ_PROPOSE_DAILY_DEFAULT).toBe(200);
    expect(FAQ_AUDIT_PER_HOUR).toEqual({ windowMs: 60 * 60 * 1000, limit: 30 });
  });

  it("1 人が使い切っても、別の人は使える", () => {
    for (let i = 0; i < FREE_FAQ_PER_HOUR.limit; i += 1) {
      expect(takeClientToken("faq", "user_a", FREE_FAQ_PER_HOUR, 0)).toBe(true);
    }
    expect(takeClientToken("faq", "user_a", FREE_FAQ_PER_HOUR, 0)).toBe(false);
    expect(takeClientToken("faq", "user_b", FREE_FAQ_PER_HOUR, 0)).toBe(true);
    // 1 時間たてば戻る
    expect(takeClientToken("faq", "user_a", FREE_FAQ_PER_HOUR, 60 * 60 * 1000 + 1)).toBe(true);
  });

  it("クイック診断と FAQ 提案は別々に数える（片方を使い切っても他方は動く）", () => {
    expect(takeDailyToken("faq", 1, 0)).toBe(true);
    expect(takeDailyToken("faq", 1, 0)).toBe(false);
    expect(takeDailyToken("faq-propose", 1, 0)).toBe(true);
  });

  it("環境変数で上書きできる（FREE_FAQ_DAILY_LIMIT / FAQ_PROPOSE_DAILY_LIMIT）", () => {
    vi.stubEnv("FREE_FAQ_DAILY_LIMIT", "50");
    expect(envInt("FREE_FAQ_DAILY_LIMIT", FREE_FAQ_DAILY_DEFAULT)).toBe(50);
    vi.stubEnv("FAQ_PROPOSE_DAILY_LIMIT", "0");
    // 0 = 止める（費用が出ているときの緊急停止に使える）
    expect(envInt("FAQ_PROPOSE_DAILY_LIMIT", FAQ_PROPOSE_DAILY_DEFAULT)).toBe(0);
    expect(takeDailyToken("faq-propose-off", 0, 0)).toBe(false);
  });
});
