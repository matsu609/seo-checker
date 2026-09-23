/**
 * クレジット制（仕様書 §6）。純関数。
 *
 * 1 クレジット = 原価 ¥1 相当。標準プランは月 2,000 クレジットを付与し、
 * **繰越なし・月次リセット**（未使用分を負債にしない）。
 * 上限に達してもソフトキャップ: **定期実行は止めず、オンデマンド（Live）だけ止める**。
 * 超過課金は初期は行わない。
 */
import { jstMonthKey, monthRangeJst } from "@/lib/time/jst";
import { isLiveOnlyModel } from "./types";
import type { CreditAction, GeoModel, MeasurementKind, RunMode } from "./types";

/** 標準プランの月間付与（§6.1） */
export const MONTHLY_CREDITS = 2000;

/** 消費レート（§6.2）。ここも設定値であってロジックに埋めない */
export const CREDIT_RATES: Record<CreditAction, number> = {
  rank: 0.5,
  aio: 0.5,
  ai_mode: 0.5,
  // 業界の地図は 1 回 30 行が既定（原価 約 $0.033）。オンデマンドなので残高で止める
  llm_mentions: 5,
  llm_standard: 0.5,
  llm_live: 2,
  weekly_report: 30,
  monthly_analysis: 150,
};

/**
 * 計測の種類と実行モードから、記帳するアクションを決める。
 * `model` を渡すと **Perplexity は Live 相当（2 クレジット）**で記帳する。
 */
export function creditAction(kind: MeasurementKind, mode: RunMode, model?: GeoModel): CreditAction {
  if (kind === "rank") return "rank";
  if (kind === "aio") return "aio";
  if (kind === "ai_mode") return "ai_mode";
  const live = mode === "live" || (model !== undefined && isLiveOnlyModel(model));
  return live ? "llm_live" : "llm_standard";
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

/** 利用者がボタンで起こす計測（= 残高で止める対象）。定期実行はここに入れない */
const ON_DEMAND_ACTIONS: readonly CreditAction[] = ["llm_live", "llm_mentions"];

/** ソフトキャップの判定（§6.1）。定期実行は残高に関わらず通す */
export function canRun(state: CreditState, action: CreditAction): { allowed: boolean; reason: string | null } {
  const cost = creditCost(action);
  // オンデマンド（今すぐ実行・業界の地図）だけが残高で止まる
  if (ON_DEMAND_ACTIONS.includes(action)) {
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

/** 次のリセット日時（JST の翌月初 0:00）を ISO で。今月の範囲の終わり（src/lib/time/jst.ts） */
export function nextResetAt(now = new Date()): string {
  return monthRangeJst(jstMonthKey(now)).end;
}

/** リセット時刻を過ぎているか */
export function needsReset(resetAt: string, now = new Date()): boolean {
  const t = Date.parse(resetAt);
  return Number.isFinite(t) ? now.getTime() >= t : true;
}

/**
 * 月次リセットを当てた後の残高（純関数。2026-09-23）。
 *
 * 以前は定期バッチがリセットで 2,000 を保存したあと、最後に**リセット前の残高**から
 * 使った分を引いて上書きしていたため、月初の最初の実行でリセットが消えていた。
 * リセット後の残高はここで 1 回だけ決め、以降はこの値から引く。
 */
export function balanceAfterReset(account: { creditBalance: number; creditResetAt: string }, now = new Date()): { balance: number; reset: boolean } {
  if (!needsReset(account.creditResetAt, now)) return { balance: account.creditBalance, reset: false };
  return { balance: resetMonthly().balance, reset: true };
}

/** 残高から使った分を引く（小数 2 桁。マイナスは許す = 定期実行は止めない。§6.1） */
export function deductCredits(balance: number, credits: number): number {
  return round(balance - credits);
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
  // 順位 800 + AI Overviews 200 + AI モード 200（2026-09-21 に AI モードを追加）
  const rankAio = (800 + 200 + 200) * CREDIT_RATES.rank;
  const llmStandard = 1080 * CREDIT_RATES.llm_standard;
  const llmPrecision = 420 * CREDIT_RATES.llm_standard;
  const weeklyReport = 4 * CREDIT_RATES.weekly_report;
  const monthlyAnalysis = CREDIT_RATES.monthly_analysis;
  const total = rankAio + llmStandard + llmPrecision + weeklyReport + monthlyAnalysis;
  return { rankAio, llmStandard, llmPrecision, weeklyReport, monthlyAnalysis, total, remaining: granted - total };
}
