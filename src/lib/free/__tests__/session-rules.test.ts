/**
 * 無料診断の専用リンクと署名付き Cookie（純粋な部分。利用者の決定 2026-10-02）。
 */
import { describe, expect, it } from "vitest";
import { constantTimeEqual, FREE_LINK_PREFIX, FREE_SESSION_COOKIE, FREE_SESSION_DAYS, FREE_STAFF_ENTRY_PATH, FREE_TOKEN_LENGTH, freeLinkToken, freeSessionExpiry, freeSessionKey, signFreeSession, verifyFreeSession } from "../session-rules";

describe("専用リンクのトークン", () => {
  it("定数（パス・名前・日数）", () => {
    expect(FREE_LINK_PREFIX).toBe("/free/");
    expect(FREE_STAFF_ENTRY_PATH).toBe("/free");
    expect(FREE_SESSION_COOKIE).toBe("free_diagnosis");
    expect(FREE_SESSION_DAYS).toBe(30);
    expect(freeSessionExpiry(1_000)).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
  });

  it("同じ秘密なら同じトークン、秘密を変えると変わる。URL に使える文字だけ", async () => {
    const a = await freeLinkToken("sk_test_secret");
    expect(a).toHaveLength(FREE_TOKEN_LENGTH);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await freeLinkToken("sk_test_secret")).toBe(a);
    expect(await freeLinkToken("sk_test_secret2")).not.toBe(a);
  });

  it("トークンと Cookie の鍵は別（トークンが漏れても Cookie を偽造できない）", async () => {
    const token = await freeLinkToken("s");
    const key = Buffer.from(new Uint8Array(await freeSessionKey("s"))).toString("base64url");
    expect(key.startsWith(token)).toBe(false);
  });

  it("constantTimeEqual", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
  });
});

describe("署名付き Cookie", () => {
  it("署名した値はその鍵で通り、期限が過ぎると通らない", async () => {
    const key = await freeSessionKey("secret");
    const now = 1_700_000_000_000;
    const value = await signFreeSession(now + 60_000, key);
    expect(value).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifyFreeSession(value, key, now)).toBe(true);
    expect(await verifyFreeSession(value, key, now + 60_000)).toBe(false);
  });

  it("改ざん・別の鍵・壊れた形は通らない", async () => {
    const key = await freeSessionKey("secret");
    const other = await freeSessionKey("secret2");
    const now = 1_700_000_000_000;
    const value = await signFreeSession(now + 60_000, key);
    const [exp, sig] = value.split(".");
    expect(await verifyFreeSession(value, other, now)).toBe(false);
    expect(await verifyFreeSession(`${Number(exp) + 1}.${sig}`, key, now)).toBe(false);
    const flipped = sig[0] === "A" ? "B" : "A";
    expect(await verifyFreeSession(`${exp}.${flipped}${sig.slice(1)}`, key, now)).toBe(false);
    for (const bad of [undefined, null, "", "abc", ".", "123.", ".sig", "12a.sig", `${exp}.${sig}x`]) {
      expect(await verifyFreeSession(bad, key, now)).toBe(false);
    }
  });
});
