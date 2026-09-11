/**
 * 公開範囲の定義を固定するテスト。
 *
 * ここが崩れると「実費の出る API が誰でも叩ける」か「無料診断が動かない」の
 * どちらかになる。特に /api/site（無料診断・公開）と /api/site-audit・
 * /api/site-report（実費・要ログイン）は前方一致で取り違えやすいので必ず見る。
 */
import { describe, expect, it } from "vitest";
import {
  isApiPath,
  isProtectedPath,
  isPublicPath,
  normalizePath,
  PUBLIC_PATHS,
  unauthorizedResponse,
} from "../routes";

describe("公開パス", () => {
  it("無料診断の画面と、その裏側の API だけが公開", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/api/analyze")).toBe(true);
    expect(isPublicPath("/api/site")).toBe(true);
    expect(isPublicPath("/api/faq")).toBe(true);
    // 利用規約とプライバシーポリシーは登録前に読めなければならない
    // （Google OAuth の審査と Clerk の設定でも URL を求められる）
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/terms/")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/privacy/")).toBe(true);
    // 無料 MEO 診断（実費はハンドラ側の回数制限で守る）
    expect(isPublicPath("/meo")).toBe(true);
    expect(isPublicPath("/api/meo/search")).toBe(true);
    expect(isPublicPath("/api/meo/report")).toBe(true);
    // 有料の MEO はログイン必須のまま
    expect(isPublicPath("/tools/maps")).toBe(false);
    expect(isPublicPath("/api/meo/history")).toBe(false);
  });

  it("ログイン画面は公開（保護するとログインできなくなる）", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-in/factor-one")).toBe(true);
    expect(isPublicPath("/sign-up")).toBe(true);
    expect(isPublicPath("/sign-up/verify-email-address")).toBe(true);
    // Google の認可から戻る先。ここを保護すると接続の途中で流れが切れる
    expect(isPublicPath("/sso-callback")).toBe(true);
  });

  it("末尾のスラッシュがあっても同じ判定になる", () => {
    expect(normalizePath("/api/site/")).toBe("/api/site");
    expect(normalizePath("/")).toBe("/");
    expect(isPublicPath("/api/site/")).toBe(true);
    expect(isPublicPath("/tools/rank/")).toBe(false);
  });
});

describe("保護パス", () => {
  it("ツール画面と設定はログインが要る", () => {
    for (const p of ["/tools/rank", "/tools/writing", "/tools/site-audit", "/settings"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });

  // 前方一致にすると /api/site が /api/site-audit まで公開してしまう
  it("/api/site に前方一致する別の API を公開しない", () => {
    expect(isPublicPath("/api/site-audit")).toBe(false);
    expect(isPublicPath("/api/site-audit/summary")).toBe(false);
    expect(isPublicPath("/api/site-report")).toBe(false);
    expect(isPublicPath("/api/sitemap")).toBe(false);
  });

  it("公開 API の下の階層は公開しない", () => {
    expect(isPublicPath("/api/analyze/secret")).toBe(false);
    expect(isPublicPath("/api/faq/bulk")).toBe(false);
    // Cron の入口は 1 本だけ。/api/cron/ 配下を丸ごと公開しない
    expect(isPublicPath("/api/cron/maps-refresh")).toBe(true);
    expect(isPublicPath("/api/cron")).toBe(false);
    expect(isPublicPath("/api/cron/other")).toBe(false);
  });

  it("実費の出る API はすべて保護される", () => {
    const paid = [
      "/api/ai-traffic",
      "/api/aio-topics",
      "/api/aio-topics/coverage",
      "/api/integrations",
      "/api/keywords",
      "/api/llmo/run",
      "/api/llms-txt/scan",
      "/api/llms-txt/validate",
      "/api/maps/history",
      "/api/maps/history/0b2f0b8e-0000-4000-8000-000000000000",
      "/api/maps/stores",
      "/api/maps/stores/0b2f0b8e-0000-4000-8000-000000000000",
      "/api/maps/stores/0b2f0b8e-0000-4000-8000-000000000000/owner",
      "/api/maps/compare",
      "/api/maps/search",
      "/api/page-diagnosis",
      "/api/page-diagnosis/chat",
      "/api/page-report",
      "/api/prompt-expansion",
      "/api/rank/measure",
      "/api/site-audit",
      "/api/site-audit/summary",
      "/api/site-report",
      "/api/writing/body",
      "/api/writing/check",
      "/api/writing/outline",
      "/api/writing/plan",
      "/api/writing/rewrite",
    ];
    for (const p of paid) expect(isProtectedPath(p), p).toBe(true);
  });

  it("似た名前で公開判定を通り抜けられない", () => {
    for (const p of ["/index", "/api", "/API/SITE", "/api/site%2Faudit", "/../api/site"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  // 守るべき不変条件は「保護対象のパスを別の綴りで公開扱いにできないこと」。
  // 逆向き（"//" が "/" に正規化されて公開になる）は、行き先が公開の
  // 無料診断なので実害が無い
  it("スラッシュを足しても保護対象は保護されたまま", () => {
    for (const p of ["//tools/rank", "/tools//rank", "//api/site-audit", "/api//site-audit", "//settings"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});

describe("公開パスの一覧", () => {
  it("増えていないか（増やすときは意図的に更新する）", () => {
    expect(PUBLIC_PATHS.pages).toEqual(["/", "/meo", "/terms", "/privacy"]);
    expect(PUBLIC_PATHS.apis).toEqual([
      "/api/analyze",
      "/api/site",
      "/api/faq",
      "/api/meo/search",
      "/api/meo/report",
      "/api/cron/maps-refresh",
    ]);
    expect(PUBLIC_PATHS.authPrefixes).toEqual(["/sign-in", "/sign-up", "/sso-callback"]);
    expect(PUBLIC_PATHS.pagePrefixes).toEqual(["/r/"]);
    expect(PUBLIC_PATHS.apiPrefixes).toEqual(["/api/r/"]);
  });
});

describe("来店客向けアンケート（口コミ支援）は公開、店舗側の管理 API は保護", () => {
  it("/r/<slug> と /api/r/<slug>/* は公開", () => {
    expect(isPublicPath("/r/abcDEF123456")).toBe(true);
    expect(isPublicPath("/r/abcDEF123456/")).toBe(true);
    expect(isPublicPath("/api/r/abcDEF123456")).toBe(true);
    expect(isPublicPath("/api/r/abcDEF123456/answers")).toBe(true);
    expect(isPublicPath("/api/r/abcDEF123456/events")).toBe(true);
    expect(isPublicPath("/api/r/abcDEF123456/direct")).toBe(true);
  });

  it("接頭辞そのものや似たパスは公開しない", () => {
    for (const p of ["/r", "/r/", "/rank", "/reviews", "/api/r", "/api/r/", "/api/reviews", "/api/reviews/forms", "/api/rank/measure", "/tools/reviews"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("店舗側の管理 API と画面は保護される", () => {
    for (const p of [
      "/tools/reviews",
      "/api/reviews/forms",
      "/api/reviews/forms/0b2f0b8e-0000-4000-8000-000000000000",
      "/api/reviews/forms/0b2f0b8e-0000-4000-8000-000000000000/channels",
      "/api/reviews/forms/0b2f0b8e-0000-4000-8000-000000000000/qr",
      "/api/reviews/responses",
      "/api/reviews/responses/0b2f0b8e-0000-4000-8000-000000000000",
    ]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
});

describe("API と画面の出し分け", () => {
  // API にリダイレクトを返すと、ブラウザの fetch が Clerk のホスト画面まで
  // 追いかけて HTML を受け取り、呼び出し側がエラーを表示できなくなる
  it("API のパスを見分ける", () => {
    expect(isApiPath("/api/site-audit")).toBe(true);
    expect(isApiPath("/api/writing/plan")).toBe(true);
    expect(isApiPath("/tools/rank")).toBe(false);
    expect(isApiPath("/")).toBe(false);
    // "/api" 単体はルートが無いので API 扱いしない
    expect(isApiPath("/api")).toBe(false);
    expect(isApiPath("/apiary/x")).toBe(false);
  });

  it("未ログインの API 応答は 401 の JSON でキャッシュさせない", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      error: "この機能を使うにはログインが必要です。",
      code: "unauthorized",
    });
  });
});

describe("マスター画面は公開しない", () => {
  // 全顧客の請求情報が出る画面。ログイン必須の側に必ず入っていること
  it("/admin と /api/admin/* は保護される", () => {
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/admin/")).toBe(false);
    expect(isPublicPath("/api/admin/features")).toBe(false);
  });
});
