/**
 * 無料診断の専用ログインの署名付き Cookie（純粋な部分。利用者の決定 2026-10-02）。
 */
import { describe, expect, it } from "vitest";
import { FREE_LOGIN_PATH, FREE_SESSION_COOKIE, FREE_SESSION_DAYS, freeSessionExpiry, freeSessionKey, signFreeSession, verifyFreeSession } from "../session-rules";

describe("署名付き Cookie", () => {
  it("定数（パス・名前・日数）", () => {
    expect(FREE_LOGIN_PATH).toBe("/free/login");
    expect(FREE_SESSION_COOKIE).toBe("free_diagnosis");
    expect(FREE_SESSION_DAYS).toBe(30);
    expect(freeSessionExpiry(1_000)).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
  });

  it("署名した値はその鍵で通り、期限が過ぎると通らない", async () => {
    const key = await freeSessionKey("demo", "pass-word");
    const now = 1_700_000_000_000;
    const value = await signFreeSession(now + 60_000, key);
    expect(value).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifyFreeSession(value, key, now)).toBe(true);
    expect(await verifyFreeSession(value, key, now + 60_000)).toBe(false);
  });

  it("改ざん・別の鍵・壊れた形は通らない", async () => {
    const key = await freeSessionKey("demo", "pass-word");
    const other = await freeSessionKey("demo", "pass-word2");
    const now = 1_700_000_000_000;
    const value = await signFreeSession(now + 60_000, key);
    const [exp, sig] = value.split(".");
    expect(await verifyFreeSession(value, other, now)).toBe(false);
    // 期限だけ伸ばす
    expect(await verifyFreeSession(`${Number(exp) + 1}.${sig}`, key, now)).toBe(false);
    // 署名の 1 文字を変える
    const flipped = sig[0] === "A" ? "B" : "A";
    expect(await verifyFreeSession(`${exp}.${flipped}${sig.slice(1)}`, key, now)).toBe(false);
    for (const bad of [undefined, null, "", "abc", ".", "123.", ".sig", "12a.sig", `${exp}.${sig}x`]) {
      expect(await verifyFreeSession(bad, key, now)).toBe(false);
    }
  });

  it("ID かパスワードを変えると鍵が変わる（配っていた Cookie が全部無効になる）", async () => {
    const a = new Uint8Array(await freeSessionKey("demo", "p"));
    const b = new Uint8Array(await freeSessionKey("demo2", "p"));
    const c = new Uint8Array(await freeSessionKey("demo", "q"));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });
});
