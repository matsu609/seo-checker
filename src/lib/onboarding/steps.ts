/**
 * 申し込み（カード登録）が終わったあとの「はじめかた」。純粋なデータだけを置く。
 *
 * 順番は カード登録 → Google 連携 → 店舗登録 → ツール（利用者の決定 2026-09-13）。
 * 先にカードを登録してもらうのは、無料期間中もすべての機能が開くため。Google を先に
 * 繋いでも有料ツールが鍵のままだと数値が見られず、無駄足になる。
 *
 * リンク先は必ず registry.ts にある画面のパスにする（steps.test.ts で固定）。
 */

export interface OnboardingStep {
  /** 画面に出す番号（1 始まり） */
  n: number;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  /** その場でやらなくても良い手順（店舗を持たない利用者など） */
  optional?: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    n: 1,
    title: "Google アカウントを接続する",
    body: "Search Console と Google アナリティクス（GA4）を読み取り専用で接続します。ログインに使った Google アカウントでも、データを読む許可は別に必要です。接続すると順位・流入・生成 AI 経由の流入が見られるようになります。",
    href: "/settings",
    linkLabel: "設定を開く",
  },
  {
    n: 2,
    title: "店舗を登録する（MEO を使う場合）",
    body: "店名で検索して自分の店舗を登録すると、毎週の自動更新・競合 5 店舗との比較・AI 総評が始まります。口コミへの返信をこの画面から投稿する機能は、Google の審査が終わり次第ご利用いただけます。",
    href: "/tools/maps",
    linkLabel: "店舗を登録する",
    optional: true,
  },
  {
    n: 3,
    title: "サイトを分析して改善案を受け取る",
    body: "精密分析を 1 回流すと、サイト全体のクロール・速度・検索順位をもとに、AI が現状分析と優先順位つきの改善案を書きます。そのまま改修案（before → after）と原稿の生成まで進めます。",
    href: "/tools/seo-analysis",
    linkLabel: "精密分析を開く",
  },
];
