/**
 * 実費の出る機能の「月の回数上限」（純粋なデータと純関数。クライアントでも読める）。
 *
 * 2026-09-21 の利用者の決定: 1 店舗あたりの原価を 3,000 円以内（Stripe の決済手数料は含めない）に収める。
 * それまで月の上限があったのは精密診断（10 回）・AI 検索モニタリング（2,000 クレジット）・
 * クイック診断（2 回）だけで、残りの有料機能は押した回数だけ実費が出ていた。
 *
 * ここに置くのは**回数の上限と、その数え方の説明**だけ。判定と記録はサーバー（gate.ts / store.ts）。
 * 精密診断は従来の仕組み（analysis_runs の行数。自動再診断も含めて月 10 回 = 利用者の決定）のままで、
 * ここには載せない（/api/usage が並べて返す）。
 *
 * 数え方の原則:
 *   - **実費が出る呼び出し**を 1 と数える。キャッシュに当たって外部 API を呼ばなかったときは数えない
 *   - 上限に達したら 429 で「今月はあと 0 回。翌月 1 日に戻る」と伝える。記録はしない
 *   - 運用者（ADMIN_EMAILS）は無制限（確認作業を止めない。プランのゲートと同じ扱い）
 *   - プランで使えない機能（limits が 0）はプランのゲートが先に 402 で止める。個別開放で開いている人は
 *     スタンダードの上限で数える（アクセスの可否はプランのゲート、量の上限はここ、と役割を分ける）
 *
 * 単価の根拠と、上限いっぱい使われたときの原価は docs/dev/OPERATIONS.md の判断の経緯（r146）に。
 */
import type { PlanId } from "@/lib/plans/catalog";

export const USAGE_FEATURES = ["writing", "page-diagnosis", "improvement", "prompt-expansion", "rank-measure", "citations", "search-estimate", "nap", "maps-search"] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];

export interface UsageLimitMeta {
  key: UsageFeature;
  /** レジストリの機能 ID（画面のラベルとプランの判定に使う） */
  featureId: string;
  /** 画面に出す名前 */
  label: string;
  /** 数える単位（「回」「検索」） */
  unit: string;
  /** 何を 1 と数えるか（設定画面の説明） */
  counts: string;
  /** プランごとの月の上限。0 = そのプランでは使えない（プランのゲートが先に止める） */
  limits: Record<Exclude<PlanId, "free">, number>;
  /** 主な実費の出どころ（説明用） */
  costs: string;
}

export const USAGE_LIMITS: Record<UsageFeature, UsageLimitMeta> = {
  writing: {
    key: "writing",
    featureId: "writing",
    label: "AI ライティング",
    unit: "回",
    counts: "AI の生成 1 回（企画書・構成案・本文・書き直し・チェックのそれぞれ）。1 記事でおよそ 3 回",
    limits: { light: 0, standard: 30, premium: 90 },
    costs: "Claude Opus（本文は 1 節 8,000 トークンまで）。構成案は SerpApi 1 検索",
  },
  "page-diagnosis": {
    key: "page-diagnosis",
    featureId: "page-diagnosis",
    label: "ページ診断",
    unit: "回",
    counts: "診断 1 回、または診断結果への質問 1 回",
    limits: { light: 20, standard: 20, premium: 60 },
    costs: "SerpApi 1 検索 + Claude Opus",
  },
  improvement: {
    key: "improvement",
    featureId: "improvement",
    label: "HP 改修提案",
    unit: "回",
    counts: "提案の生成 1 回（同じ URL・キーワードの取り直しはキャッシュに当たれば数えない）",
    limits: { light: 0, standard: 20, premium: 60 },
    costs: "Claude Opus",
  },
  "prompt-expansion": {
    key: "prompt-expansion",
    featureId: "prompt-expansion",
    label: "プロンプト拡張",
    unit: "回",
    counts: "拡張 1 回",
    limits: { light: 10, standard: 10, premium: 30 },
    costs: "Claude Opus",
  },
  "rank-measure": {
    key: "rank-measure",
    featureId: "rank",
    label: "順位計測（手動の「測る」）",
    unit: "検索",
    counts: "キーワード 1 語 × デバイス 1 つ = 1 検索（同じ語を 10 分以内に測り直した分は数えない）。毎週の自動計測は別枠（プランの語数まで）",
    limits: { light: 300, standard: 300, premium: 900 },
    costs: "SerpApi 1 検索",
  },
  citations: {
    key: "citations",
    featureId: "citations",
    label: "サイテーション",
    unit: "回",
    counts: "調べる 1 回（Google 検索 3 回分）",
    limits: { light: 10, standard: 10, premium: 30 },
    costs: "DataForSEO 3 検索",
  },
  "search-estimate": {
    key: "search-estimate",
    featureId: "search-estimate",
    label: "検索パフォーマンス（推定）",
    unit: "回",
    counts: "推定 1 回（同じドメインの取り直しはキャッシュに当たれば数えない）",
    limits: { light: 10, standard: 10, premium: 30 },
    costs: "DataForSEO Labs 1 回",
  },
  nap: {
    key: "nap",
    featureId: "nap",
    label: "NAP チェック",
    unit: "回",
    counts: "チェック 1 回",
    limits: { light: 10, standard: 10, premium: 30 },
    costs: "Places 2 回 + DataForSEO 2 検索",
  },
  "maps-search": {
    key: "maps-search",
    featureId: "maps",
    label: "店舗の検索（Google マップの登録）",
    unit: "回",
    counts: "店名で探す 1 回（同じ語の取り直しはキャッシュに当たれば数えない）",
    limits: { light: 100, standard: 100, premium: 300 },
    costs: "Places Text Search 1 回",
  },
};

/**
 * その人に適用する月の上限。null = 無制限（運用者）。
 * プランで 0 の機能は、個別開放で開いている人のためにスタンダードの上限で数える。
 */
export function usageLimitFor(key: UsageFeature, plan: PlanId, staff: boolean): number | null {
  if (staff) return null;
  const limits = USAGE_LIMITS[key].limits;
  const own = plan === "free" ? 0 : limits[plan];
  return own > 0 ? own : limits.standard;
}

/** 翌月 1 日（日本時間）の日付。「いつ戻るか」を画面に出す */
export function usageResetsOn(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 2; // 翌月（1 始まり）
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** 上限に達したときの文面 */
export function usageLimitMessage(meta: UsageLimitMeta, used: number, limit: number, resetsOn: string): string {
  const [y, m, d] = resetsOn.split("-").map(Number);
  return `今月の${meta.label}は上限（${limit.toLocaleString("ja-JP")} ${meta.unit}）に達しました（使用 ${used.toLocaleString("ja-JP")} ${meta.unit}）。${y} 年 ${m} 月 ${d} 日に戻ります。`;
}

/** 残り（0 未満にしない） */
export function usageRemaining(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - used);
}
