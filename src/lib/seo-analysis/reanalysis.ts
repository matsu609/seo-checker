/**
 * 自動再診断の「誰のどのサイトを、いつ」（純粋関数 + 候補の取得）。
 *
 * 期限: 前回の（収集できた）診断から 30 日。失敗が続いて毎日やり直さないよう、
 * 直近 7 日にどんな行（失敗を含む）があれば飛ばす。
 */
import { daysBetween } from "@/lib/time/jst";
import { listLatestRunsAllUsers, type RunStatus } from "./runs";

export const REANALYSIS_INTERVAL_DAYS = 30;
export const REANALYSIS_RETRY_DAYS = 7;

export interface RunLike {
  userId: string;
  origin: string;
  status: RunStatus;
  createdAt: string;
  input: unknown;
}

export interface ReanalysisCandidate {
  userId: string;
  origin: string;
  /** 前回（収集できたもの）の入力をそのまま使う */
  input: unknown;
  lastOkAt: string;
}

/** 新しい順の行 → 利用者 × サイトごとに、期限が来ているもの（古い順） */
export function pickDue(rows: readonly RunLike[], now: Date): ReanalysisCandidate[] {
  const latestAny = new Map<string, RunLike>();
  const latestOk = new Map<string, RunLike>();
  for (const r of rows) {
    const key = `${r.userId} ${r.origin}`;
    if (!latestAny.has(key)) latestAny.set(key, r);
    if (r.status !== "failed" && !latestOk.has(key)) latestOk.set(key, r);
  }
  const out: ReanalysisCandidate[] = [];
  for (const [key, ok] of latestOk) {
    if (daysBetween(ok.createdAt, now) < REANALYSIS_INTERVAL_DAYS) continue;
    const any = latestAny.get(key);
    if (any && daysBetween(any.createdAt, now) < REANALYSIS_RETRY_DAYS) continue;
    out.push({ userId: ok.userId, origin: ok.origin, input: ok.input, lastOkAt: ok.createdAt });
  }
  return out.sort((a, b) => a.lastOkAt.localeCompare(b.lastOkAt));
}

export async function fetchDueCandidates(): Promise<RunLike[]> {
  return listLatestRunsAllUsers();
}
