/**
 * クレジット制（仕様書 §6）。純関数。
 *
 * 1 クレジット = 原価 ¥1 相当。標準プランは月 2,000 クレジットを付与し、
 * **繰越なし・月次リセット**（未使用分を負債にしない）。
 * 上限に達してもソフトキャップ: **定期実行は止めず、オンデマンド（Live）だけ止める**。
 * 超過課金は初期は行わない。
 */
import type { CreditAction, MeasurementKind, RunMode } from "./types";

/** 標準プランの月間付与（§6.1） */
export const MONTHLY_CREDITS = 2000;

/** 消費レート（§6.2）。ここも設定値であってロジックに埋めない */
export const CREDIT_RATES: Record<CreditAction, number> = {
  rank: 0.5,
  aio: 0.5,
  llm_standard: 0.5,
  llm_live: 2,
  weekly_report: 30,
  monthly_analysis: 150,
};

/** 計測の種類と実行モードから、記帳するアクションを決める */
export function creditAction(kind: MeasurementKind, mode: RunMode): CreditAction {
  if (kind === "rank") return "rank";
  if (kind === "aio") return "aio";
  return mode === "live" ? "llm_live" : "llm_standard";
}

export function creditCost(action: CreditAction): number {
  return CREDIT_RATES[action];
}

/**
 * キャッシュを使い回した計測でもクレジットを消費するか（§11 の未決事項）。
 *
 * **消費する**を既定にした。理由: 「誰かが先に測っていたら安くなる」は
 * 説明が難しく、請求の予測もできなくなる。原価とは乖離するが、その差は
 * §7.1 の共有で生まれる利益なので、値付け側で吸収するほうが単純。
 * 方針を変えられるように環境変数で切り替えられる。
 */
export function chargeOnCacheHit(): boolean {
  return process.env.GEO_CHARGE_ON_CACHE_HIT?.trim().toLowerCase() !== "false";
}

export interface CreditState {
  balance: number;
  /** 今月付与された総量（消費内訳の分母） */
  granted: number;
}

/** ソフトキャップの判定（§6.1）。定期実行は残高に関わらず通す */
export function canRun(state: CreditState, action: CreditAction): { allowed: boolean; reason: string | null } {
  const cost = creditCost(action);
  // オンデマンド（Live）だけが残高で止まる
  if (action === "llm_live") {
    if (state.balance < cost) {
      return { allowed: false, reason: `クレジットが足りません（残り ${round(state.balance)} / 必要 ${cost}）` };
    }
    return { allowed: true, reason: null };
  }
  return { allowed: true, reason: null };
}

/** 消費したあとの残高。マイナスは許す（定期実行は止めないため） */
export function consume(state: CreditState, action: CreditAction, count = 1): CreditState {
  return { ...state, balance: round(state.balance - creditCost(action) * count) };
}

/** 月次リセット（§6.1。繰越なし） */
export function resetMonthly(granted = MONTHLY_CREDITS): CreditState {
  return { balance: granted, granted };
}

/** 次のリセット日時（JST の月初 0:00）を ISO で */
export function nextResetAt(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 1, -9, 0, 0)).toISOString();
}

/** リセット時刻を過ぎているか */
export function needsReset(resetAt: string, now = new Date()): boolean {
  const t = Date.parse(resetAt);
  return Number.isFinite(t) ? now.getTime() >= t : true;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 標準構成の消費見込み（§6.3）。画面の説明に使う */
export interface UsageForecast {
  rankAio: number;
  llmStandard: number;
  llmPrecision: number;
  weeklyReport: number;
  monthlyAnalysis: number;
  total: number;
  remaining: number;
}

export function forecastStandardPlan(granted = MONTHLY_CREDITS): UsageForecast {
  const rankAio = (800 + 200) * CREDIT_RATES.rank;
  const llmStandard = 1080 * CREDIT_RATES.llm_standard;
  const llmPrecision = 420 * CREDIT_RATES.llm_standard;
  const weeklyReport = 4 * CREDIT_RATES.weekly_report;
  const monthlyAnalysis = CREDIT_RATES.monthly_analysis;
  const total = rankAio + llmStandard + llmPrecision + weeklyReport + monthlyAnalysis;
  return { rankAio, llmStandard, llmPrecision, weeklyReport, monthlyAnalysis, total, remaining: granted - total };
}
