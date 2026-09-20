/** 掲載の再チェックの結果の表示（クライアントでも読める。判定そのものは recheck.ts） */
export type RecheckResult = "ok" | "mismatch" | "missing" | "error";

export const RECHECK_LABELS: Record<RecheckResult, string> = {
  ok: "掲載を確認",
  mismatch: "表記がずれている",
  missing: "掲載が見つからない",
  error: "確認できず",
};

export const RECHECK_TONE: Record<RecheckResult, "pass" | "warn" | "fail" | "neutral"> = {
  ok: "pass",
  mismatch: "warn",
  missing: "fail",
  error: "neutral",
};

export interface RecheckOutcome {
  result: RecheckResult;
  /** 画面にそのまま出す 1 行 */
  detail: string;
  found: { name: boolean; phone: boolean; address: boolean };
}

export interface RecheckLine {
  mediaId: string;
  mediaName: string;
  url: string;
  outcome: RecheckOutcome;
}
