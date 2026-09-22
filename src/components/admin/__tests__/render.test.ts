/**
 * マスター画面「管理アカウント」の案内カードの描画テスト。
 *
 * 運用者がこのカードだけを見て相手に説明できる状態を保つ。崩れやすいのは
 * 「追加した結果によって道のりが切り替わるか」と「案内文に宛先・招待リンクが入るか」。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MANAGER_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/landing";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";
import { AgencyFlowCard, type AgencyFlowCardProps } from "../AgencyFlowCard";

function render(props: AgencyFlowCardProps = {}): string {
  return renderToStaticMarkup(createElement(AgencyFlowCard, props));
}

describe("追加したあとの案内カード", () => {
  it("何も追加していないときは、未登録の方の道のり（登録フォーム）を出す", () => {
    const html = render();
    expect(html).toContain(`${PUBLIC_APP_ORIGIN}${SIGN_UP_PATH}`);
    expect(html).toContain("確認コード");
    // 今後の入口（顧客管理）は必ず出す
    expect(html).toContain(`${PUBLIC_APP_ORIGIN}${MANAGER_PATH}`);
  });

  it("登録済みの方を追加したときは、ログインし直す道のりを出す（新規登録を出さない）", () => {
    const html = render({ added: { kind: "promoted", email: "staff@example.com", url: null } });
    expect(html).toContain(`${PUBLIC_APP_ORIGIN}${SIGN_IN_PATH}`);
    expect(html).toContain("招待メールは送っていません");
    expect(html).not.toContain(`${PUBLIC_APP_ORIGIN}${SIGN_UP_PATH}`);
  });

  it("招待したときは、宛先と招待リンクの入った案内文を出す", () => {
    const url = "https://accounts.seo-checker.tokyo/invite?ticket=abc";
    const html = render({ added: { kind: "invited", email: "staff@example.com", url } });
    expect(html).toContain("staff@example.com");
    expect(html).toContain("ticket=abc");
  });

  it("開かない画面（ツールは案内・マスター側は 404）を必ず書く", () => {
    const html = render();
    expect(html).toContain("この画面は管理アカウントでは使いません");
    expect(html).toContain("404");
  });
});
