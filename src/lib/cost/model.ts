/**
 * 月額費用の試算（純関数。クライアントでも読める。環境変数は読まない）。
 *
 * マスター画面の「外部連携」の下に、**店舗数（契約しているお客様の数）を横軸にした
 * 月額の原価**をグラフで出すためのモデル（利用者の指示 2026-09-21「使用料金予測、
 * 店舗数における料金予測と固定でかかる料金をグラフで表示させて、毎月これぐらいかかるよ
 * という試算を表示させてほしい」）。
 *
 * 考え方:
 *   固定費 … 店舗数に関係なく毎月かかるもの（Vercel Pro・Clerk Pro・Supabase Pro・Resend Pro・
 *            ドメインの年額 ÷ 12・SerpApi の月額プラン）。プラン制のものは、店舗数から必要な
 *            使用量を出し、それを満たす最小のプランを選ぶので**段階的に上がる**
 *   変動費 … 店舗が 1 つ増えるごとに増えるもの（DataForSEO・Places・Anthropic・Stripe の手数料）。
 *            無料枠（Places の SKU ごとの月間無料枠など）を差し引いてから数える
 *
 * 単価と使用量の前提は ASSUMPTIONS に**全部書き出して画面に出す**（`src/lib/features/integrations.ts` の
 * 料金欄と同じ PRICING_CHECKED_AT 時点の値）。単価は変わるので、ここを直せば図が全部変わる。
 * 「正確な試算」に見せるために前提を隠さない。1 店舗 = 1 契約（1 アカウント・1 サイト・1 店舗）。
 */
import type { IntegrationKey } from "@/lib/features/integrations";
import { DEFAULT_UNIT_PRICES, DEFAULT_USD_JPY } from "@/lib/geo/pricing";
import { PLAN_BY_ID, type PlanId } from "@/lib/plans/catalog";
import { RANK_AUTO_LIMITS } from "@/lib/rank/limits";

/** 1 か月の週数（週 1 回の定期処理を月に換算する） */
export const WEEKS_PER_MONTH = 52 / 12;

/** 試算に使う契約プラン（プレミアムは人の作業なので原価の式に乗せない） */
export type CostPlan = Extract<PlanId, "light" | "standard">;

export interface CostInput {
  /** 契約している店舗（お客様）の数 */
  stores: number;
  /** そのうちスタンダードの割合（0〜1）。残りはライト */
  standardRatio: number;
  /** 為替（1 USD = 何円） */
  usdJpy: number;
  /** Vercel を Pro にする（Hobby は非商用に限られるので、売る段階では要る） */
  vercelPro: boolean;
  /** Clerk を Pro にする（ロゴ非表示・許可リストなど。無料枠でも動く） */
  clerkPro: boolean;
}

export const DEFAULT_COST_INPUT: CostInput = {
  stores: 10,
  standardRatio: 1,
  usdJpy: DEFAULT_USD_JPY,
  vercelPro: true,
  clerkPro: false,
};

/** 費用の前提（画面にそのまま表で出す） */
export interface Assumption {
  key: IntegrationKey;
  label: string;
  value: string;
}

/**
 * SerpApi の月額プラン。店舗数から必要な検索回数を出し、足りる最小のプランを選ぶ。
 * 最上位を超えたら「要問い合わせ」で、最上位の単価で按分して線を延ばす（図が途切れないように）。
 */
export const SERPAPI_TIERS = [
  { label: "Free", searches: 100, usd: 0 },
  { label: "Starter", searches: 1_000, usd: 25 },
  { label: "Developer", searches: 5_000, usd: 75 },
  { label: "Production", searches: 15_000, usd: 150 },
  { label: "Big Data", searches: 30_000, usd: 275 },
] as const;

/** 順位計測（自動）の 1 店舗あたりの語数上限。定期処理と同じ値を読む（値を 2 か所に持たない） */
export const RANK_KEYWORDS: Record<CostPlan, number> = { light: RANK_AUTO_LIMITS.light, standard: RANK_AUTO_LIMITS.standard };

/** 前提の数値（この 1 か所だけを直す） */
export const A = {
  /** 精密診断の自動再診断（月 1 回）で使う SerpApi の検索回数 */
  serpapiPerReanalysis: 7,
  /** 手動の操作（ページ診断・精密診断のやり直し）で使う SerpApi の検索回数（1 店舗・月） */
  serpapiOnDemand: 10,
  /** Places: 週次の一斉更新 1 回で呼ぶ回数（自社 Details 1 + 競合 Details 5 = 6、Nearby 1、Text Search = 対策キーワード 3） */
  placesDetailsPerRefresh: 6,
  placesNearbyPerRefresh: 1,
  placesTextSearchPerRefresh: 3,
  /** Places の単価（USD / 1 回。Enterprise = $20 / 1,000、Nearby Enterprise = $35 / 1,000、Text Search Pro = $32 / 1,000） */
  placesDetailsUsd: 0.02,
  placesNearbyUsd: 0.035,
  placesTextSearchUsd: 0.032,
  /** Places の SKU ごとの月間無料枠（回。2025-03 から: Enterprise 1,000 / Pro 5,000） */
  placesEnterpriseFree: 1_000,
  placesProFree: 5_000,
  /** デモの無料クイック診断（店舗）月 50 回 = 検索 1 + 詳細 1 ずつ（店舗数に関係ない使用量） */
  demoMeoRunsPerMonth: 50,
  /** DataForSEO: AI 検索モニタリングの標準構成（1 アカウント・月。仕様書 §2.1: 順位 800 / AIO 200 / LLM 1,500） */
  geoRankPerMonth: 800,
  geoAioPerMonth: 200,
  geoLlmPerMonth: 1_500,
  /** DataForSEO: 検索パフォーマンス（推定）・サイテーション・NAP の手動実行（1 店舗・月、USD） */
  dataforseoOnDemandUsd: 0.03,
  /** Anthropic（1 店舗・月、USD）: ライト = 自動再診断 1 回（Opus）+ MEO の総評 4 回 + 意図分類など。スタンダード = + 改修案・FAQ 提案・返信案 */
  anthropicUsd: { light: 1.6, standard: 4.0 } as Record<CostPlan, number>,
  /** Stripe の決済手数料（国内カード） */
  stripeFeeRate: 0.036,
  /** Supabase: 1 店舗・月あたりの増分（MB。精密診断 1 行 ≈ 1 MB + MEO の報告書など）と、残す月数 */
  supabaseMbPerStoreMonth: 1.3,
  supabaseRetentionMonths: 12,
  supabaseFreeMb: 500,
  supabaseProUsd: 25,
  /** Resend: 1 店舗・月あたりの通数（月次レポート 1 + 変化の知らせ）と Free の上限 */
  resendMailsPerStore: 10,
  resendFreeMails: 3_000,
  resendProUsd: 20,
  /** Clerk: Free の MAU 上限と超過単価、Pro の月額 */
  clerkFreeMau: 10_000,
  clerkOverageUsd: 0.02,
  clerkProUsd: 25,
  /** Vercel Pro の月額（メンバー 1 人） */
  vercelProUsd: 20,
  /** ドメイン（.tokyo）の年額（円） */
  domainYearlyJpy: 1_800,
} as const;

export interface CostLine {
  key: IntegrationKey;
  /** 店舗数に関係なくかかる分（円） */
  fixedJpy: number;
  /** 店舗数に応じて増える分（円） */
  variableJpy: number;
  /** 計算の根拠（1 行。画面の内訳表に出す） */
  note: string;
}

export interface CostEstimate {
  input: CostInput;
  lines: readonly CostLine[];
  fixedJpy: number;
  variableJpy: number;
  totalJpy: number;
  /** 1 店舗あたりの原価（店舗 0 のときは固定費そのまま） */
  perStoreJpy: number;
  /** 売上（ライト 38,000 × 店舗 + スタンダード 50,000 × 店舗） */
  revenueJpy: number;
  /** 粗利（売上 − 原価） */
  grossJpy: number;
  /** 粗利率（売上 0 のときは null） */
  grossRatio: number | null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** 店舗数をライト / スタンダードに割る（スタンダードは四捨五入。合計は必ず stores） */
export function splitStores(stores: number, standardRatio: number): Record<CostPlan, number> {
  const n = Math.max(0, Math.floor(Number.isFinite(stores) ? stores : 0));
  const standard = Math.round(n * clamp01(standardRatio));
  return { light: n - standard, standard };
}

/** 必要な検索回数から SerpApi のプランを選ぶ */
export function pickSerpapiTier(searches: number): { label: string; usd: number; searches: number; over: boolean } {
  const need = Math.max(0, searches);
  for (const t of SERPAPI_TIERS) if (need <= t.searches) return { ...t, over: false };
  const top = SERPAPI_TIERS[SERPAPI_TIERS.length - 1];
  // 最上位を超えたぶんは最上位の単価で按分（要問い合わせ）
  const usd = (need / top.searches) * top.usd;
  return { label: "要問い合わせ", usd, searches: need, over: true };
}

const yen = (usd: number, rate: number) => Math.round(usd * rate);
const fmt = (n: number) => Math.round(n).toLocaleString("ja-JP");

/** 月額の試算（店舗数 1 点） */
export function estimateMonthlyCost(raw: Partial<CostInput> = {}): CostEstimate {
  const input: CostInput = { ...DEFAULT_COST_INPUT, ...raw };
  const rate = input.usdJpy > 0 && Number.isFinite(input.usdJpy) ? input.usdJpy : DEFAULT_USD_JPY;
  const by = splitStores(input.stores, input.standardRatio);
  const stores = by.light + by.standard;
  const lines: CostLine[] = [];

  // ── SerpApi: 週次の順位計測（プランごとの上限まで）+ 自動再診断 + 手動 → 月額プランを選ぶ
  const serpSearches = Math.ceil(
    by.light * (RANK_KEYWORDS.light * WEEKS_PER_MONTH + A.serpapiPerReanalysis + A.serpapiOnDemand) +
      by.standard * (RANK_KEYWORDS.standard * WEEKS_PER_MONTH + A.serpapiPerReanalysis + A.serpapiOnDemand),
  );
  const tier = pickSerpapiTier(serpSearches);
  lines.push({
    key: "serpapi",
    fixedJpy: yen(tier.usd, rate),
    variableJpy: 0,
    note: `月 ${fmt(serpSearches)} 検索（ライト ${RANK_KEYWORDS.light} KW・スタンダード ${RANK_KEYWORDS.standard} KW × 週 1 + 再診断 ${A.serpapiPerReanalysis} + 手動 ${A.serpapiOnDemand}）→ ${tier.label} $${fmt(tier.usd)}${tier.over ? "（最上位の単価で按分）" : ` / ${fmt(tier.searches)} 検索`}`,
  });

  // ── DataForSEO: AI 検索モニタリング（スタンダードだけ）+ 手動の推定・サイテーション（全店舗）
  const geoUsd = A.geoRankPerMonth * DEFAULT_UNIT_PRICES.rank + A.geoAioPerMonth * DEFAULT_UNIT_PRICES.aio + A.geoLlmPerMonth * DEFAULT_UNIT_PRICES.llmStandard;
  const dfsUsd = by.standard * geoUsd + stores * A.dataforseoOnDemandUsd;
  lines.push({
    key: "dataforseo",
    fixedJpy: 0,
    variableJpy: yen(dfsUsd, rate),
    note: `AI 検索モニタリング $${geoUsd.toFixed(2)} × スタンダード ${fmt(by.standard)} 店（順位 ${fmt(A.geoRankPerMonth)} + AIO ${fmt(A.geoAioPerMonth)} + LLM ${fmt(A.geoLlmPerMonth)} 回。同じ語の 24 時間キャッシュは見込まない）+ 推定・サイテーション $${A.dataforseoOnDemandUsd} × ${fmt(stores)} 店`,
  });

  // ── Places: 週次の一斉更新 × 全店舗 + デモの無料診断。SKU ごとの無料枠を引く
  const detailsCalls = stores * A.placesDetailsPerRefresh * WEEKS_PER_MONTH + A.demoMeoRunsPerMonth;
  const nearbyCalls = stores * A.placesNearbyPerRefresh * WEEKS_PER_MONTH;
  const textCalls = stores * A.placesTextSearchPerRefresh * WEEKS_PER_MONTH + A.demoMeoRunsPerMonth;
  const placesUsd =
    Math.max(0, detailsCalls - A.placesEnterpriseFree) * A.placesDetailsUsd +
    Math.max(0, nearbyCalls - A.placesEnterpriseFree) * A.placesNearbyUsd +
    Math.max(0, textCalls - A.placesProFree) * A.placesTextSearchUsd;
  lines.push({
    key: "places",
    fixedJpy: 0,
    variableJpy: yen(placesUsd, rate),
    note: `月 Details ${fmt(detailsCalls)} 回（無料 ${fmt(A.placesEnterpriseFree)}）・Nearby ${fmt(nearbyCalls)} 回（無料 ${fmt(A.placesEnterpriseFree)}）・Text Search ${fmt(textCalls)} 回（無料 ${fmt(A.placesProFree)}）。週 1 回の一斉更新 = 1 店舗につき Details ${A.placesDetailsPerRefresh} + Nearby ${A.placesNearbyPerRefresh} + Text Search ${A.placesTextSearchPerRefresh}、デモ診断 月 ${A.demoMeoRunsPerMonth} 回込み`,
  });

  // ── Anthropic: 1 店舗あたりの目安（プランで違う）
  const anthropicUsd = by.light * A.anthropicUsd.light + by.standard * A.anthropicUsd.standard;
  lines.push({
    key: "anthropic",
    fixedJpy: 0,
    variableJpy: yen(anthropicUsd, rate),
    note: `ライト $${A.anthropicUsd.light} × ${fmt(by.light)} 店 + スタンダード $${A.anthropicUsd.standard} × ${fmt(by.standard)} 店（自動再診断 1 回 + MEO の総評 + AI が作るツールの利用の目安。使い方で大きく動く）`,
  });

  // ── Stripe: 売上の 3.6%
  const revenueJpy = by.light * PLAN_BY_ID.light.priceYen + by.standard * PLAN_BY_ID.standard.priceYen;
  const stripeJpy = Math.round(revenueJpy * A.stripeFeeRate);
  lines.push({
    key: "stripe",
    fixedJpy: 0,
    variableJpy: stripeJpy,
    note: `売上 ¥${fmt(revenueJpy)} × ${(A.stripeFeeRate * 100).toFixed(1)}%（月額は無し）`,
  });

  // ── Supabase: 容量が Free を超えたら Pro
  const supabaseMb = stores * A.supabaseMbPerStoreMonth * A.supabaseRetentionMonths;
  const supabasePro = supabaseMb > A.supabaseFreeMb;
  lines.push({
    key: "supabase",
    fixedJpy: supabasePro ? yen(A.supabaseProUsd, rate) : 0,
    variableJpy: 0,
    note: `保存量の見込み ${fmt(supabaseMb)} MB（${A.supabaseMbPerStoreMonth} MB × ${fmt(stores)} 店 × ${A.supabaseRetentionMonths} か月）→ ${supabasePro ? `Free の ${fmt(A.supabaseFreeMb)} MB を超えるので Pro $${A.supabaseProUsd}` : `Free（${fmt(A.supabaseFreeMb)} MB まで）`}`,
  });

  // ── Resend: 通数が Free を超えたら Pro
  const mails = stores * A.resendMailsPerStore;
  const resendPro = mails > A.resendFreeMails;
  lines.push({
    key: "resend",
    fixedJpy: resendPro ? yen(A.resendProUsd, rate) : 0,
    variableJpy: 0,
    note: `月 ${fmt(mails)} 通（${A.resendMailsPerStore} 通 × ${fmt(stores)} 店）→ ${resendPro ? `Free の ${fmt(A.resendFreeMails)} 通を超えるので Pro $${A.resendProUsd}` : `Free（${fmt(A.resendFreeMails)} 通まで）`}`,
  });

  // ── Clerk: Pro は任意。MAU の超過は店舗数がそのまま MAU
  const clerkOverUsd = Math.max(0, stores - A.clerkFreeMau) * A.clerkOverageUsd;
  lines.push({
    key: "clerk",
    fixedJpy: input.clerkPro ? yen(A.clerkProUsd, rate) : 0,
    variableJpy: yen(clerkOverUsd, rate),
    note: `${input.clerkPro ? `Pro $${A.clerkProUsd}` : "Free"}（MAU ${fmt(A.clerkFreeMau)} まで無料。いま ${fmt(stores)} 人）`,
  });

  // ── Vercel: Pro は任意（Hobby は非商用に限る）
  lines.push({
    key: "vercel",
    fixedJpy: input.vercelPro ? yen(A.vercelProUsd, rate) : 0,
    variableJpy: 0,
    note: input.vercelPro ? `Pro $${A.vercelProUsd}（メンバー 1 人）` : "Hobby $0（個人・非商用に限る。売る段階で Pro が要る）",
  });

  // ── 定額 0 のもの・年額のもの
  lines.push({ key: "onamae", fixedJpy: Math.round(A.domainYearlyJpy / 12), variableJpy: 0, note: `年 ¥${fmt(A.domainYearlyJpy)} ÷ 12` });
  lines.push({ key: "cron", fixedJpy: 0, variableJpy: 0, note: "Vercel のプランに含まれる" });
  lines.push({ key: "github", fixedJpy: 0, variableJpy: 0, note: "Free" });
  lines.push({ key: "cloudflare", fixedJpy: 0, variableJpy: 0, note: "Free（DNS と Workers の無料枠）" });
  lines.push({ key: "pagespeed", fixedJpy: 0, variableJpy: 0, note: "無料（割り当ての範囲）" });
  lines.push({ key: "crux", fixedJpy: 0, variableJpy: 0, note: "無料（割り当ての範囲）" });
  lines.push({ key: "ahrefs", fixedJpy: 0, variableJpy: 0, note: "無料の公開エンドポイント（API ユニット消費なし）" });
  lines.push({ key: "openpagerank", fixedJpy: 0, variableJpy: 0, note: "無料（1 日 1,000 回）" });
  lines.push({ key: "google-business", fixedJpy: 0, variableJpy: 0, note: "無料（お客様の OAuth）" });

  const fixedJpy = lines.reduce((a, l) => a + l.fixedJpy, 0);
  const variableJpy = lines.reduce((a, l) => a + l.variableJpy, 0);
  const totalJpy = fixedJpy + variableJpy;
  const grossJpy = revenueJpy - totalJpy;
  return {
    input: { ...input, stores, usdJpy: rate },
    lines,
    fixedJpy,
    variableJpy,
    totalJpy,
    perStoreJpy: stores > 0 ? Math.round(totalJpy / stores) : totalJpy,
    revenueJpy,
    grossJpy,
    grossRatio: revenueJpy > 0 ? grossJpy / revenueJpy : null,
  };
}

/** グラフの横軸にする店舗数。選んだ店舗数が無ければ足す（並びは昇順） */
export const COST_STEPS = [1, 3, 5, 10, 20, 30, 50, 100] as const;

export function costSteps(current: number, base: readonly number[] = COST_STEPS): number[] {
  const n = Math.max(0, Math.floor(current));
  return [...new Set([...base, n])].sort((a, b) => a - b);
}

/** 図の系列（6 色に収めるため、同じ性質のものをまとめる） */
export const COST_SERIES = [
  { id: "fixed", label: "固定費（基盤・プラン）", keys: ["vercel", "clerk", "supabase", "resend", "onamae", "cron", "github", "cloudflare"] },
  { id: "serpapi", label: "SerpApi（月額プラン）", keys: ["serpapi"] },
  { id: "dataforseo", label: "DataForSEO", keys: ["dataforseo"] },
  { id: "places", label: "Google マップ（Places）", keys: ["places"] },
  { id: "anthropic", label: "Anthropic（Claude）", keys: ["anthropic"] },
  { id: "stripe", label: "Stripe の手数料", keys: ["stripe"] },
] as const satisfies readonly { id: string; label: string; keys: readonly IntegrationKey[] }[];

export type CostSeriesId = (typeof COST_SERIES)[number]["id"];

/** 系列ごとの合計（円） */
export function seriesTotals(est: CostEstimate): Record<CostSeriesId, number> {
  const out = {} as Record<CostSeriesId, number>;
  for (const s of COST_SERIES) {
    out[s.id] = est.lines.filter((l) => (s.keys as readonly IntegrationKey[]).includes(l.key)).reduce((a, l) => a + l.fixedJpy + l.variableJpy, 0);
  }
  return out;
}

/** 画面の「前提」表 */
export function assumptions(): readonly Assumption[] {
  return [
    { key: "serpapi", label: "順位計測の登録キーワード上限（週 1 回）", value: `ライト ${RANK_KEYWORDS.light} 語 / スタンダード ${RANK_KEYWORDS.standard} 語。ほかに再診断 ${A.serpapiPerReanalysis} 回 + 手動 ${A.serpapiOnDemand} 回 / 店・月` },
    { key: "serpapi", label: "SerpApi の月額プラン", value: SERPAPI_TIERS.map((t) => `${t.label} $${t.usd} = ${fmt(t.searches)} 回`).join(" / ") },
    { key: "dataforseo", label: "AI 検索モニタリングの標準構成（スタンダードだけ）", value: `順位 ${fmt(A.geoRankPerMonth)} × $${DEFAULT_UNIT_PRICES.rank} + AIO ${fmt(A.geoAioPerMonth)} × $${DEFAULT_UNIT_PRICES.aio} + LLM ${fmt(A.geoLlmPerMonth)} × $${DEFAULT_UNIT_PRICES.llmStandard} / 店・月` },
    { key: "dataforseo", label: "検索パフォーマンス（推定）・サイテーション・NAP", value: `$${A.dataforseoOnDemandUsd} / 店・月（手動。同じ入力は 24 時間キャッシュ）` },
    { key: "places", label: "週次の一斉更新（毎週月曜）", value: `1 店舗につき Place Details ${A.placesDetailsPerRefresh}（自社 1 + 競合 5）・Nearby ${A.placesNearbyPerRefresh}・Text Search ${A.placesTextSearchPerRefresh}（対策キーワード）` },
    { key: "places", label: "Places の単価と無料枠", value: `Details $${A.placesDetailsUsd}・Nearby $${A.placesNearbyUsd}（Enterprise: 月 ${fmt(A.placesEnterpriseFree)} 回まで無料）・Text Search $${A.placesTextSearchUsd}（Pro: 月 ${fmt(A.placesProFree)} 回まで無料）。デモの無料診断 月 ${A.demoMeoRunsPerMonth} 回込み` },
    { key: "anthropic", label: "Claude の利用（目安）", value: `ライト $${A.anthropicUsd.light} / スタンダード $${A.anthropicUsd.standard} / 店・月（自動再診断 1 回 = Opus で数十〜数百円、MEO の総評 1 回 ≈ 5 円、改修案・FAQ 提案・返信案は使った分）` },
    { key: "stripe", label: "決済手数料", value: `売上の ${(A.stripeFeeRate * 100).toFixed(1)}%（国内カード）` },
    { key: "supabase", label: "保存量", value: `${A.supabaseMbPerStoreMonth} MB / 店・月 × ${A.supabaseRetentionMonths} か月。Free ${fmt(A.supabaseFreeMb)} MB を超えたら Pro $${A.supabaseProUsd}` },
    { key: "resend", label: "メールの通数", value: `${A.resendMailsPerStore} 通 / 店・月。Free ${fmt(A.resendFreeMails)} 通を超えたら Pro $${A.resendProUsd}` },
    { key: "clerk", label: "Clerk", value: `Free は MAU ${fmt(A.clerkFreeMau)} まで（超過 $${A.clerkOverageUsd} / 人）。Pro $${A.clerkProUsd} は任意` },
    { key: "vercel", label: "Vercel", value: `Pro $${A.vercelProUsd} / 月（Hobby $0 は個人・非商用に限る）` },
    { key: "onamae", label: "ドメイン", value: `年 ¥${fmt(A.domainYearlyJpy)} ÷ 12` },
  ];
}
