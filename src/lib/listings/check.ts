/**
 * 掲載の生存監視: 控えてある掲載ページを実際に見に行く。サーバー専用。
 *
 * 取得は analyzer の fetchText を使う（SSRF 対策・タイムアウト・サイズ上限つき。
 * 掲載ページの URL はお客様が入力する値なので、内部アドレスへの踏み台にしない）。
 * 判定は monitor.ts の純粋関数（判定基準を 2 か所に持たない）。
 */
import * as cheerio from "cheerio";
import { fetchText } from "@/lib/analyzer/fetch";
import { mediaById } from "./media";
import { applyCheck, judgePage, type CheckOutcome } from "./monitor";
import { stateOf, type ListingProfile, type ListingStates } from "./profile";

/** 1 ページの取得に許す時間とサイズ（監視なので短く小さく） */
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

export interface ListingCheckResult extends CheckOutcome {
  mediaId: string;
  mediaName: string;
  url: string;
  checkedAt: string;
}

/**
 * 本文と生の HTML をつないだ文字列を作る。
 * 本文だけだと、店名が属性や JSON の中にしか無いページで「読めない」になりやすい。
 */
export function searchableText(html: string): string {
  let body = "";
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    body = $.text();
  } catch {
    // 壊れた HTML でも生のほうは使える
  }
  return `${body}\n${html}`;
}

/** 1 媒体を見に行く。例外は投げない（つながらないことは想定内） */
export async function checkOne(mediaId: string, url: string, profile: ListingProfile, at: Date): Promise<ListingCheckResult> {
  const mediaName = mediaById(mediaId)?.name ?? mediaId;
  const base = { mediaId, mediaName, url, checkedAt: at.toISOString() };
  let status = 0;
  let text = "";
  try {
    const res = await fetchText(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
    status = res.status;
    text = res.body;
  } catch {
    // FetchError（内部アドレス・URL の形が不正）もここに来る。status 0 = つながらない
  }
  return { ...base, ...judgePage({ status, text: status >= 200 && status < 300 ? searchableText(text) : "" }, profile) };
}

/**
 * 複数の媒体をまとめて見に行き、状況に書き戻した states を返す。
 * 相手の媒体に負荷をかけないよう 1 件ずつ順に取る（同時に叩かない）。
 */
export async function checkListings(
  profile: ListingProfile,
  states: ListingStates,
  mediaIds: readonly string[],
  options: { now?: Date; budgetMs?: number } = {},
): Promise<{ results: ListingCheckResult[]; states: ListingStates }> {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 60_000);
  const results: ListingCheckResult[] = [];
  let next: ListingStates = { ...states };
  for (const mediaId of mediaIds) {
    if (Date.now() > deadline) break;
    const state = stateOf(next, mediaId);
    const url = state.url.trim();
    if (!url) continue;
    const result = await checkOne(mediaId, url, profile, new Date());
    results.push(result);
    next = { ...next, [mediaId]: applyCheck(state, result, now) };
  }
  return { results, states: next };
}
