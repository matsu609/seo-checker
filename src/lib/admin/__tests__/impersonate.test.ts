/**
 * 代理ログインを認めてよいかのテスト。
 *
 * 通してはいけない組み合わせを間違えると、運用者どうしのなりすましが作れてしまい、
 * 「誰がやったのか」がログからも追えなくなる。閉じる方向に倒れているかを固定する。
 */
import { describe, expect, it } from "vitest";
import { canImpersonate, SESSION_MAX_SECONDS, TICKET_TTL_SECONDS } from "../impersonate";

const MASTER = "user_2masterAAA";
const CLIENT = "user_9clientBBB";
const ADMINS = ["wolf@example.com"];

function check(over: Partial<Parameters<typeof canImpersonate>[0]> = {}) {
  return canImpersonate({
    masterUserId: MASTER,
    targetUserId: CLIENT,
    targetVerifiedEmails: ["customer@example.com"],
    admins: ADMINS,
    ...over,
  });
}

describe("代理ログインを認めてよいか", () => {
  it("ふつうのお客様なら認める", () => {
    expect(check()).toEqual({ ok: true });
  });

  it("自分自身には使わせない", () => {
    expect(check({ targetUserId: MASTER }).ok).toBe(false);
  });

  // 片方の運用者がもう片方になりすませると、操作の責任が追えなくなる
  it("運用者のアカウントには入れない", () => {
    expect(check({ targetVerifiedEmails: ["wolf@example.com"] }).ok).toBe(false);
    expect(check({ targetVerifiedEmails: ["WOLF@Example.com"] }).ok).toBe(false);
    expect(check({ targetVerifiedEmails: ["other@example.com", "wolf@example.com"] }).ok).toBe(false);
  });

  // 未確認のメールを渡さないのは呼び出し側の責任。ここは渡された分だけを見る
  it("運用者と同じ文字列でも、確認済みでなければ渡ってこない前提", () => {
    expect(check({ targetVerifiedEmails: [] })).toEqual({ ok: true });
  });

  it("ユーザー ID の形が違えば認めない", () => {
    expect(check({ targetUserId: "org_123" }).ok).toBe(false);
    expect(check({ masterUserId: "" }).ok).toBe(false);
  });

  it("断る理由の文面を必ず返す", () => {
    const denied = check({ targetUserId: MASTER });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason.length).toBeGreaterThan(0);
  });
});

describe("代理ログインの有効期限", () => {
  // 開きっぱなしにしないための上限。伸ばすときは意図を持って伸ばす
  it("チケットは短く、セッションも切れる", () => {
    expect(TICKET_TTL_SECONDS).toBeLessThanOrEqual(10 * 60);
    expect(SESSION_MAX_SECONDS).toBeLessThanOrEqual(60 * 60);
  });
});
