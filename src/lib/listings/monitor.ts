/**
 * 掲載の生存監視 —「登録した」ではなく「**今も正しく出ている**」を確かめる。
 * クライアントでも読める純粋な関数だけ（取得は check.ts）。
 *
 * 09-19 の調査で「これが商品価値そのもの」と結論した部分。媒体に登録しても、
 * 統合・削除・情報の上書きで静かに消えたり電話番号が古いままになったりする。
 * 定期的に掲載ページを見に行き、店名と電話が今も出ているかを控える。
 *
 * **確実でないことを「消えた」と言わない。**ページが JavaScript で描かれていると
 * こちらのクローラからは中身が読めないので、その場合は「確認できず」にして
 * 人に見てもらう。`gone` にするのは 404 / 410 が返ったときだけ。
 */
import { normalizeForCompare, stateOf, type ListingProfile, type ListingState, type ListingStates } from "./profile";

export const CHECK_RESULTS = ["live", "changed", "unknown", "gone", "unreachable"] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

export const CHECK_RESULT_LABELS: Record<CheckResult, string> = {
  live: "掲載を確認",
  changed: "内容が違う",
  unknown: "確認できず",
  gone: "見つからない",
  unreachable: "つながらない",
};

/** 次に見に行くまでの日数。問題があるものは早く見直す */
export const CHECK_INTERVAL_DAYS: Record<CheckResult, number> = {
  live: 30,
  changed: 7,
  unknown: 14,
  gone: 7,
  unreachable: 3,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PageCheckInput {
  /** HTTP のステータス（取得できなければ 0） */
  status: number;
  /** ページの本文（タグを除いたもの）と生の HTML をつないだもの */
  text: string;
}

export interface CheckOutcome {
  result: CheckResult;
  nameFound: boolean;
  phoneFound: boolean;
  /** 画面にそのまま出す 1 文 */
  message: string;
}

/** 区切り記号だけを詰めて、電話番号を探せる形にする（文字は境界として残す） */
export function squeezeSeparators(text: string): string {
  return text.normalize("NFKC").replace(/[\s\-‐‑–—―ー－−()[\].·・]/g, "");
}

export function digitsOf(value: string): string {
  return value.normalize("NFKC").replace(/\D/g, "");
}

/**
 * 掲載ページの中身を判定する（純粋関数）。
 * 店名が見つからないときに `gone` と言い切らないのがこの関数の肝。
 */
export function judgePage(input: PageCheckInput, profile: ListingProfile): CheckOutcome {
  if (input.status === 404 || input.status === 410) {
    return { result: "gone", nameFound: false, phoneFound: false, message: "掲載ページが見つかりません（404 / 410）。削除されたか、URL が変わった可能性があります。" };
  }
  if (input.status < 200 || input.status >= 300) {
    const detail = input.status === 0 ? "接続できませんでした" : `HTTP ${input.status}`;
    return { result: "unreachable", nameFound: false, phoneFound: false, message: `掲載ページを開けませんでした（${detail}）。時間をおいて確認します。` };
  }

  const name = profile.name.trim();
  const phone = digitsOf(profile.phone);
  const nameFound = name.length > 0 && normalizeForCompare(input.text).includes(normalizeForCompare(name));
  const phoneFound = phone.length >= 9 && squeezeSeparators(input.text).includes(phone);

  if (!nameFound) {
    return {
      result: "unknown",
      nameFound,
      phoneFound,
      message: "ページは開けましたが、店名を読み取れませんでした（JavaScript で描かれているページではよくあります）。一度ご自身で開いてご確認ください。",
    };
  }
  if (phone.length >= 9 && !phoneFound) {
    return { result: "changed", nameFound, phoneFound, message: "店名は出ていますが、登録した電話番号が見当たりません。媒体側の情報が古いおそれがあります。" };
  }
  return { result: "live", nameFound, phoneFound, message: phoneFound ? "店名と電話番号が今も出ています。" : "店名が今も出ています。" };
}

/** 次に見に行く日時 */
export function nextCheckAt(result: CheckResult, from: Date): string {
  return new Date(from.getTime() + CHECK_INTERVAL_DAYS[result] * DAY_MS).toISOString();
}

/** 確認の対象にできるか（掲載ページの URL を控えていて、対象外でないこと） */
export function isCheckable(state: ListingState): boolean {
  return state.status !== "skip" && state.url.trim().startsWith("http");
}

/** いま見に行くべきか（一度も見ていない、または次回の時刻を過ぎている） */
export function isDue(state: ListingState, now: Date): boolean {
  if (!isCheckable(state)) return false;
  if (!state.nextCheckAt) return true;
  const next = Date.parse(state.nextCheckAt);
  return Number.isNaN(next) || next <= now.getTime();
}

/** 確認の対象になる媒体 id（いま見るべきものだけ） */
export function dueMediaIds(states: ListingStates, now: Date): string[] {
  return Object.keys(states).filter((id) => isDue(stateOf(states, id), now));
}

/** 確認の結果を状況に書き戻す（掲載の状況そのものは変えない。人が決めたものを機械で上書きしない） */
export function applyCheck(state: ListingState, outcome: CheckOutcome, at: Date): ListingState {
  return {
    ...state,
    lastCheckedAt: at.toISOString(),
    nextCheckAt: nextCheckAt(outcome.result, at),
    checkResult: outcome.result,
    checkNote: outcome.message,
  };
}

export interface MonitorSummary {
  /** 掲載ページの URL を控えている媒体の数 */
  checkable: number;
  /** 一度でも見に行った数 */
  checked: number;
  live: number;
  /** 手当てが要るもの（内容が違う / 見つからない） */
  problems: number;
  /** いちばん古い確認日時 */
  oldestCheckedAt: string | null;
}

export function summarizeMonitor(states: ListingStates, mediaIds: readonly string[]): MonitorSummary {
  const out: MonitorSummary = { checkable: 0, checked: 0, live: 0, problems: 0, oldestCheckedAt: null };
  for (const id of mediaIds) {
    const s = stateOf(states, id);
    if (!isCheckable(s)) continue;
    out.checkable += 1;
    if (!s.lastCheckedAt) continue;
    out.checked += 1;
    if (s.checkResult === "live") out.live += 1;
    if (s.checkResult === "changed" || s.checkResult === "gone") out.problems += 1;
    if (!out.oldestCheckedAt || s.lastCheckedAt < out.oldestCheckedAt) out.oldestCheckedAt = s.lastCheckedAt;
  }
  return out;
}
