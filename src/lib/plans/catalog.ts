/**
 * 料金プランの定義。純粋なデータだけを置く（クライアントからも読める）。
 *
 * 売るのは 1 つだけ（利用者の決定 2026-09-11）:
 *   free     … サイトと店舗の状態を採点するだけ。見込み顧客の入口
 *   pro      … 「オールインワン」月額 9,800 円。SEO / AIO / MEO の全機能 + AI が作る成果物
 *   standard … 販売しない内部の段階（AI が作る機能を除いた全部）。
 *              「使わない機能ごとに 3,000 円引き」の個別対応で、運用者が Clerk の
 *              publicMetadata.plan に手で割り当てる用途に残している
 *
 * 機能ごとの `plan`（registry.ts）は standard / pro の 2 段階のまま。
 * オールインワン（pro）は両方を含むので、購入者にはすべて開く。
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
  /** 料金表に出して購入できるか。false は個別対応用の内部段階 */
  purchasable: boolean;
  /** サイドバーの鍵バッジなど、短く出すとき */
  shortLabel: string;
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
    purchasable: true,
    shortLabel: "無料",
  },
  {
    id: "standard",
    label: "スタンダード（個別対応）",
    priceYen: 6_800,
    summary: "AI が作る機能を除いた内部の段階。個別のご相談で割り当てます。",
    highlights: ["SEO・AIO・MEO の計測・診断ツールすべて"],
    clerkPlan: "user:standard",
    purchasable: false,
    shortLabel: "有料",
  },
  {
    id: "pro",
    label: "オールインワン",
    priceYen: 9_800,
    summary: "SEO・AIO・MEO のすべての機能を、ひとつの料金で。AI が改修案と原稿も作ります。",
    highlights: [
      "SEO: サイト診断・ページ診断・順位計測・検索パフォーマンス（Search Console）・サイトレポート・キーワード調査",
      "AIO: ページ最適化レポート・AIO 頻出トピック・LLMO モニタリング・プロンプト拡張・生成 AI 流入分析（GA4）",
      "MEO: Google マップの店舗診断、毎週の自動更新と履歴、競合 5 店舗との比較、AI 総評、口コミ支援（アンケート QR と AI 下書き）",
      "AI が作る: HP 改修提案（before → after）・AI ライティング・llms.txt 生成",
      "使わない機能があれば、機能ごとに 3,000 円引きでご相談に応じます",
    ],
    clerkPlan: "user:pro",
    purchasable: true,
    shortLabel: "有料",
  },
] as const;

/** 料金表に出すプラン（購入できるものだけ） */
export const SELLABLE_PLANS: readonly Plan[] = PLANS.filter((p) => p.purchasable);

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(
  PLANS.map((p) => [p.id, p]),
) as Record<PlanId, Plan>;

export function planLabel(id: PlanId): string {
  return PLAN_BY_ID[id].label;
}

/** 短い表示（鍵バッジ用。「無料」「有料」） */
export function planShortLabel(id: PlanId): string {
  return PLAN_BY_ID[id].shortLabel;
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

/**
 * required を満たすために必要な、いちばん安い「購入できる」プラン。
 * standard は販売していないので、standard の機能でも案内はオールインワンになる。
 */
export function upgradeTarget(required: PlanId): Plan {
  const candidates = SELLABLE_PLANS.filter((p) => planAllows(p.id, required)).sort((a, b) => a.priceYen - b.priceYen);
  return candidates[0] ?? PLAN_BY_ID[required];
}
