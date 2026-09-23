/**
 * 掲載の再チェック（純粋関数）。掲載済みの媒体のページに、店名・電話・住所が今も出ているかを見る。
 *
 * 09-19 の調査で「今も正しく出ている」の証明が商品価値そのもの、と結論した部分。
 * 判定は控えめに: 店名が本文に無ければ「消えた」、店名はあるが電話も住所も無ければ「ずれ」、
 * 取得できなければ「確認できず」（消えたとは言わない）。
 */
import * as cheerio from "cheerio";
import { phoneDigits } from "@/lib/nap/compare";
import { addDays, nextMonthDayAtJst } from "@/lib/time/jst";
import { normalizeForCompare, type ListingProfile, type ListingState, type ListingStates } from "./profile";
import { RECHECK_LABELS, type RecheckLine, type RecheckOutcome, type RecheckResult } from "./recheck-labels";

/** 定期の再チェックが動く日（毎月この日の 5:00 JST。jobs/schedule.ts の listings-recheck と同じ） */
export const RECHECK_DAY_OF_MONTH = 2;
export const RECHECK_HOUR_JST = 5;
/** 確認してから、次の定期実行まで最低これだけ空ける（手動で確かめた直後の定期実行は飛ばす） */
export const RECHECK_MIN_GAP_DAYS = 20;
/**
 * 期限がこの日数以内に迫っていれば今回の定期実行で確かめる。
 * 以前の「30 日後」で保存された期限（2 日の実行 → 翌月 3〜4 日）を、翌月 2 日に拾うため。
 */
export const RECHECK_GRACE_DAYS = 5;

export { RECHECK_LABELS, type RecheckLine, type RecheckOutcome, type RecheckResult };

/** HTML → 本文のテキスト（script / style を除く） */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html || "");
  $("script, style, noscript, template").remove();
  return $("body").text() || $.root().text();
}

/**
 * 電話番号の数字だけ（+81 は 0 に戻す）。2026-09-23 に NAP チェックと同じ実装（citations/analyze.ts）へ寄せた。
 * 違いは「途中の + も消す」だけで、本文全体を数字にして探すこの用途ではそのほうが取りこぼさない。
 */
export { phoneDigits };

/** 住所の「見つかった」判定。全体が無ければ、先頭からの一部（8 文字以上・6 割以上）で見る */
export function addressFound(text: string, address: string): boolean {
  const na = normalizeForCompare(address).replace(/^〒?\d{3}-?\d{4}/, "");
  if (na.length < 4) return false;
  if (text.includes(na)) return true;
  const min = Math.max(8, Math.ceil(na.length * 0.6));
  return na.length >= min && text.includes(na.slice(0, min));
}

/** 本文（テキスト）に基本情報があるか */
export function checkNapInText(text: string, profile: ListingProfile): RecheckOutcome {
  const t = normalizeForCompare(text);
  const name = profile.name.trim() ? t.includes(normalizeForCompare(profile.name)) : false;
  const digits = phoneDigits(profile.phone);
  const phone = digits.length >= 6 ? phoneDigits(text).includes(digits) : false;
  const address = profile.address.trim() ? addressFound(t, profile.address) : false;
  const found = { name, phone, address };
  if (!name) return { result: "missing", detail: "ページに店名が見つかりません（掲載が消えたか、URL が変わった可能性）", found };
  if (!phone && !address) return { result: "mismatch", detail: "店名はありますが、電話番号も住所も一致しません", found };
  const parts = [phone ? "電話" : null, address ? "住所" : null].filter(Boolean).join("・");
  return { result: "ok", detail: `店名と${parts}を確認しました`, found };
}

/** 取得できなかったとき */
export function checkFailed(reason: string): RecheckOutcome {
  return { result: "error", detail: reason, found: { name: false, phone: false, address: false } };
}

/**
 * 次の確認日時 = 20 日以上先の、最初の定期実行（毎月 2 日 5:00 JST）。
 *
 * 以前は「30 日後」だったが、定期実行は毎月 2 日なので、2 月の実行の 30 日後（3 月 3〜4 日）は
 * 3 月 2 日の実行で期限前になり丸 1 か月飛んでいた。30 日の月も Cron の起動が数秒ずれるだけで飛んだ。
 */
export function nextCheckAt(now: Date): string {
  return nextMonthDayAtJst(addDays(now, RECHECK_MIN_GAP_DAYS), RECHECK_DAY_OF_MONTH, RECHECK_HOUR_JST).toISOString();
}

/** 確認結果を状況に書き込む（状況そのもの status は変えない。判断は利用者がする） */
export function applyCheck(state: ListingState, outcome: RecheckOutcome, now: Date): ListingState {
  return { ...state, lastCheckedAt: now.toISOString(), nextCheckAt: nextCheckAt(now), check: { result: outcome.result, detail: outcome.detail, found: outcome.found } };
}

/** 今回確認する媒体（掲載済み・URL あり・期限が来ている）。force なら期限を無視 */
export function mediaToCheck(states: ListingStates, now: Date, force = false): string[] {
  return Object.entries(states)
    .filter(([, s]) => s.status === "live" && s.url.trim().length > 0 && (force || !s.nextCheckAt || s.nextCheckAt <= addDays(now, RECHECK_GRACE_DAYS).toISOString()))
    .map(([id]) => id);
}

/** 知らせの文面（消えた・ずれた分だけ） */
export function buildListingAlert(storeName: string, lines: readonly RecheckLine[]): { title: string; body: string } | null {
  const bad = lines.filter((l) => l.outcome.result === "missing" || l.outcome.result === "mismatch");
  if (bad.length === 0) return null;
  const missing = bad.filter((l) => l.outcome.result === "missing").length;
  return {
    title: missing > 0 ? `${storeName} の掲載が ${missing} 媒体で見つかりません` : `${storeName} の掲載に表記のずれが ${bad.length} 媒体あります`,
    body: `月に 1 回の掲載の確認で、次の媒体に問題がありました。媒体の管理画面で掲載を確かめ、必要なら登録し直してください。\n${bad
      .map((l) => `・${l.mediaName}: ${RECHECK_LABELS[l.outcome.result]}（${l.outcome.detail}）${l.url}`)
      .join("\n")}`,
  };
}
