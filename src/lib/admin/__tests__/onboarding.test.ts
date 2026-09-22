/**
 * 管理アカウントの案内（追加したあとの道のり）のテスト。
 *
 * ここが崩れると、運用者が相手に間違った案内を渡してしまう。特に次の 3 つを固定する。
 *   ①「登録済みの方には招待メールが飛ばない」ことが案内に書いてあるか
 *   ② 招待の道のりに「同じメールアドレスで登録する」が書いてあるか（違うと管理アカウントにならない）
 *   ③ 最後が必ず顧客管理（今後の入口）で終わっているか
 */
import { describe, expect, it } from "vitest";
import { MANAGER_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/landing";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";
import {
  agencyClosedDoors,
  agencyEntryPoints,
  agencyFlowSteps,
  agencyGuideMessage,
  appUrl,
} from "../onboarding";

const CLIENTS = `${PUBLIC_APP_ORIGIN}${MANAGER_PATH}`;

describe("絶対 URL", () => {
  it("アプリの公開 URL に繋げる（案内文は外に渡すので相対パスにしない）", () => {
    expect(appUrl(MANAGER_PATH)).toBe(CLIENTS);
    expect(appUrl(MANAGER_PATH).startsWith("https://")).toBe(true);
  });
});

describe("道のり（未登録の方）", () => {
  const steps = agencyFlowSteps("invited");

  it("運用者の作業から始まり、番号が 1 から続く", () => {
    expect(steps[0].actor).toBe("運用者");
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    expect(steps.slice(1).every((s) => s.actor === "ご本人")).toBe(true);
  });

  it("登録フォームと確認コードを通って、最後は顧客管理のブックマークで終わる", () => {
    const urls = steps.map((s) => s.url);
    expect(urls).toContain(`${PUBLIC_APP_ORIGIN}${SIGN_UP_PATH}`);
    expect(steps.some((s) => s.title.includes("確認コード"))).toBe(true);
    expect(steps[steps.length - 1].url).toBe(CLIENTS);
    expect(steps[steps.length - 1].title).toContain("ブックマーク");
  });

  it("同じメールアドレスで登録する注意が入っている（違うと管理アカウントにならない）", () => {
    const pitfalls = steps.map((s) => s.pitfall ?? "").join("\n");
    expect(pitfalls).toContain("同じメールアドレス");
    expect(pitfalls).toContain("迷惑メール");
  });
});

describe("道のり（登録済みの方）", () => {
  const steps = agencyFlowSteps("promoted");

  it("メールを待たせない（招待は飛ばないと書く）", () => {
    const text = steps.map((s) => `${s.detail}${s.pitfall ?? ""}`).join("\n");
    expect(text).toContain("招待メールは送られません");
    expect(text).toContain("待たない");
  });

  it("ログインし直す手順があり、最後は顧客管理で終わる", () => {
    expect(steps.some((s) => s.url === `${PUBLIC_APP_ORIGIN}${SIGN_IN_PATH}`)).toBe(true);
    expect(steps[steps.length - 1].url).toBe(CLIENTS);
  });

  it("登録のやり直し（新しいパスワード）を求めない", () => {
    const text = steps.map((s) => `${s.title}${s.detail}`).join("\n");
    expect(text).not.toContain("登録フォーム");
  });
});

describe("ログイン後の入口", () => {
  it("先頭が毎日の入口（顧客管理）で、代理ログインも案内する", () => {
    const rows = agencyEntryPoints();
    expect(rows[0].url).toBe(CLIENTS);
    expect(rows.some((r) => r.where.includes("この方の画面を見る"))).toBe(true);
  });

  it("デモの無料診断は 2 本とも絶対 URL で出す", () => {
    const demo = agencyEntryPoints().filter((r) => r.purpose.startsWith("デモ"));
    expect(demo).toHaveLength(2);
    expect(demo.map((r) => r.url)).toEqual([`${PUBLIC_APP_ORIGIN}/`, `${PUBLIC_APP_ORIGIN}/meo`]);
  });
});

describe("開かない画面", () => {
  it("ツール側は案内、マスター側は 404 と書き分ける", () => {
    const doors = agencyClosedDoors();
    expect(doors.some((d) => d.result.includes("この画面は管理アカウントでは使いません"))).toBe(true);
    expect(doors.some((d) => d.result.includes("404"))).toBe(true);
  });
});

describe("お渡しする案内文", () => {
  it("招待のときは招待リンクを載せ、同じアドレスでの登録を求める", () => {
    const text = agencyGuideMessage({
      entry: "invited",
      email: "staff@example.com",
      inviteUrl: "https://accounts.seo-checker.tokyo/invite?ticket=abc",
    });
    expect(text).toContain("https://accounts.seo-checker.tokyo/invite?ticket=abc");
    expect(text).toContain("かならず staff@example.com で登録してください");
    expect(text).toContain(CLIENTS);
  });

  it("招待リンクが無いときは登録フォームの URL を案内する", () => {
    const text = agencyGuideMessage({ entry: "invited", email: "staff@example.com", inviteUrl: null });
    expect(text).toContain(`${PUBLIC_APP_ORIGIN}${SIGN_UP_PATH}`);
  });

  it("登録済みのときは新規登録を案内せず、ログインし直しだけを案内する", () => {
    const text = agencyGuideMessage({ entry: "promoted", email: "staff@example.com" });
    expect(text).toContain("招待メールもありません");
    expect(text).toContain(`${PUBLIC_APP_ORIGIN}${SIGN_IN_PATH}`);
    expect(text).not.toContain(`${PUBLIC_APP_ORIGIN}${SIGN_UP_PATH}`);
  });

  it("どちらの道のりでも、入口が顧客管理だけだと伝える", () => {
    for (const entry of ["invited", "promoted"] as const) {
      const text = agencyGuideMessage({ entry, email: "staff@example.com" });
      expect(text).toContain("今後の入口はここだけです");
      expect(text).toContain("ツール・設定・料金プランは管理アカウントでは開きません");
    }
  });
});
