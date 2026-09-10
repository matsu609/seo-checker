/**
 * 料金プランの定義。純粋なデータだけを置く（クライアントからも読める）。
 *
 * 切り分けの考え方:
 *   free     … サイトの状態を採点するだけ。見込み顧客の入口
 *   standard … 測る・調べる。数値と分析結果を見る
 *   pro      … AI が成果物（改修案・原稿・ファイル）を作る
 */

export const PLAN_IDS = ["free", "standard", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** 上位ほど大きい。プランの比較はこの順位で行う */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, standard: 1, pro: 2 };

export interface Plan {
  id: PlanId;
  label: string;
  /** 月額（円・税別）。0 は無料 */
  priceYen: number;
  summary: string;
  highlights: readonly string[];
  /**
   * Clerk Billing（決済の実体は Stripe）のプラン識別子。
   *
   * 形式は `user:<スラッグ>`。Clerk ダッシュボードの「請求する」で作るプランの
   * スラッグを、この id と同じ文字列（standard / pro）にしておくこと。
   * ずれると購入しても機能が開かない。plans.test.ts で形式を固定している。
   */
  clerkPlan: string;
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    label: "無料診断",
    priceYen: 0,
    summary: "URL か店名を入れるだけで、サイト（SEO・AIO）と Google マップの店舗（MEO）を採点します。ログインも不要です。",
    highlights: [
      "無料 SEO・AIO 診断（1 ページ / サイト全体）",
      "無料 MEO 診断（Google マップの店舗 1 件）",
      "総合スコアとカテゴリ別スコア、改善提案の一覧",
      "報告書の PDF ダウンロードと印刷",
    ],
    clerkPlan: "user:free",
  },
  {
    id: "standard",
    label: "スタンダード",
    priceYen: 5_000,
    summary: "検索の実測値とサイトの分析結果を継続して確認できます。",
    highlights: [
      "サイト診断・ページ最適化レポート・ページ診断",
      "検索パフォーマンス（Search Console の実測値）",
      "順位計測・AI Overviews 引用・LLMO モニタリング",
      "生成 AI 流入分析・サイトレポート（GA4）",
      "キーワード調査・AIO トピック",
    ],
    clerkPlan: "user:standard",
  },
  {
    id: "pro",
    label: "プロ",
    priceYen: 10_000,
    summary: "スタンダードの内容に加え、AI が改修案と原稿を作ります。",
    highlights: [
      "スタンダードのすべて",
      "HP 改修提案（そのまま貼って使える before → after）",
      "AI ライティング（企画・構成・本文・リライト・校正）",
      "llms.txt の生成",
    ],
    clerkPlan: "user:pro",
  },
] as const;

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
) as Record<PlanId, Plan>;

export function planLabel(id: PlanId): string {
  return PLAN_BY_ID[id].label;
}

/** 価格の表示（「無料」「月額 5,000 円」） */
export function planPriceLabel(id: PlanId): string {
  const yen = PLAN_BY_ID[id].priceYen;
  return yen === 0 ? "無料" : `月額 ${yen.toLocaleString("ja-JP")} 円`;
}

/** current が required 以上のプランか */
export function planAllows(current: PlanId, required: PlanId): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

/** 文字列を PlanId にする。知らない値は null（呼び出し側で既定に倒す） */
export function toPlanId(value: unknown): PlanId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^user:/, "").replace(/^org:/, "");
  return (PLAN_IDS as readonly string[]).includes(normalized) ? (normalized as PlanId) : null;
}

/** required を満たすために必要な、いちばん安いプラン */
export function upgradeTarget(required: PlanId): Plan {
  return PLAN_BY_ID[required];
}
