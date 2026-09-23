/**
 * 「Google サーチコンソール連携」画面の状態の型と、判定の純関数（クライアントからも読める）。
 *
 * 一覧が空に見える理由は 3 つあり、出すべき案内がそれぞれ違う（needsSearchConsoleSetup）。
 *   1. 読み取りの権限が無い      → 接続（権限の追加）をしてもらう
 *   2. 一覧の取得に失敗した      → エラーを出す
 *   3. Google 側にまだ何も無い    → Search Console への登録・所有確認の手順を案内する
 * 1 や 2 のときに「まだ登録がありません」と出すと、原因の違う相手に的外れな作業をさせてしまう。
 */
import { isUnverifiedSite } from "./parse";
import type { AnalysisRecord } from "./analysis";
import type { SearchConsoleSite } from "./types";

export interface SearchConsoleStatus {
  /** Google アカウントがつながっているか（口コミ返信で接続済みの場合も true） */
  connected: boolean;
  /** Search Console の読み取り権限があるか */
  hasScope: boolean;
  /** 接続している Google アカウント（表示用） */
  email?: string;
  /** 付与済みのスコープ。権限を足すときに、既存の権限を落とさないよう一緒に要求する */
  grantedScopes: string[];
  /** そのアカウントで見られるサイト（所有権未確認のものも含む。画面で選べなくする） */
  sites: SearchConsoleSite[];
  /** 選択中のサイト */
  siteUrl: string | null;
  /** 一覧の取得に失敗した理由 */
  error?: string;
  /** AI の分析（月 1 回）。前回の結果と、今月まだ使えるか */
  analysis: {
    /** ANTHROPIC_API_KEY があるか */
    enabled: boolean;
    last: AnalysisRecord | null;
    /** 今月まだ使えるか（運用者は常に true） */
    available: boolean;
    /** 次に使える日（YYYY-MM-DD）。使える間は null */
    nextAvailableOn: string | null;
  };
}

/** 実際に選べるサイト。所有権が未確認のものは選んでも 403 になるので外す */
export function usableSites(sites: readonly SearchConsoleSite[]): SearchConsoleSite[] {
  return sites.filter((s) => !isUnverifiedSite(s));
}

/** 一覧が空の理由が「Google 側の設定がまだ」なら true（純関数） */
export function needsSearchConsoleSetup(status: Pick<SearchConsoleStatus, "connected" | "hasScope" | "error" | "sites">): boolean {
  if (!status.connected || !status.hasScope || status.error) return false;
  return usableSites(status.sites).length === 0;
}

/** Google API 呼び出し用のスコープだけを残す（openid / email / profile はログイン側が付ける） */
export function apiScopes(scopes: readonly string[]): string[] {
  return scopes.filter((s) => s.startsWith("https://www.googleapis.com/auth/"));
}

