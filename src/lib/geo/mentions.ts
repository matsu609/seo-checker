/**
 * LLM Mentions API（DataForSEO の AI Optimization。残タスク #126）。サーバー専用。
 *
 * **いまの計測（LLM Responses）との違い**:
 *   LLM Responses … 自分でプロンプトを投げて、回答本文から言及を数える（= お客様ごとの質問で測る）
 *   LLM Mentions  … DataForSEO 側が集めた「AI の回答でどのドメインがどれだけ引用されたか」を
 *                   そのままもらう（= 業界全体の地図。自分でプロンプトを選べない代わりに速く広い）
 *
 * この機能は**置き換えではなく追加**で、画面では「業界の地図」カードとして 1 回ずつ手動で叩く。
 * 定期実行には入れない（Live しか無く、費用が読めないため。§7.4 の考え方をそのまま当てる）。
 *
 * ## パスと応答の形について（大事）
 * この開発環境から docs.dataforseo.com へ出られない（egress でブロック）ため、
 * **パスも応答のキー名も公開情報から起こした推定**を含む。そこで:
 *   - パスは `GEO_PATH_MENTIONS_*` で差し替えられる
 *   - 応答は**複数の候補キーを順に見る**ゆるい読み方にして、名前が違っても落ちないようにする
 *   - 1 件も読めなかったときは「0 件」ではなく **解釈できなかった**として扱い、画面に出す
 * 2026-09-21 に DataForSEO は「Top Pages / Top Domains を Top Mentioned Pages /
 * Top Mentioned Domains に改名」と告知しているので、旧名も候補に残す。
 */
import { asArray, asRecord, pathOverride, postDataForSeo, type PostOptions } from "./dataforseo";
import { normalizeDomain } from "./normalize";
import type { MentionPlatform } from "./types";

/** 1 回で読む行数の上限。行数課金なので既定は控えめに */
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;

/**
 * 引用されているドメインの順位表のパス。
 * 改名後の `top_mentioned_domains` を既定にし、`GEO_PATH_MENTIONS_TOP_DOMAINS` で旧名に戻せる。
 */
export function topDomainsPath(): string {
  return pathOverride("GEO_PATH_MENTIONS_TOP_DOMAINS", "/ai_optimization/llm_mentions/top_mentioned_domains/live");
}

/* ───────────── 応答の読み取り（純関数） ───────────── */

/** 引用されているドメイン 1 行 */
export interface MentionDomainRow {
  domain: string;
  /** AI の回答で引用された回数 */
  mentions: number;
  /** AI 検索ボリューム（取れないことがある） */
  aiSearchVolume: number | null;
  /** 自社のドメインか */
  isOwn: boolean;
  /** 登録済みの競合か */
  isCompetitor: boolean;
}

export interface MentionsReport {
  rows: MentionDomainRow[];
  /** 条件に合う言及の総数（items の件数ではない） */
  totalCount: number | null;
  /** 自社が何位か（1 始まり）。表に出てこなければ null */
  ownRank: number | null;
  /** DataForSEO が返した実費（取れなければ null） */
  costUsd: number | null;
}

/** 数値っぽい値を拾う（文字列で返ることがある） */
function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 候補のキーを順に見て、最初に取れた数値を返す */
function pickNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const v = num(record[key]);
    if (v !== null) return v;
  }
  return null;
}

/** 候補のキーを順に見て、最初に取れた文字列を返す */
function pickString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** ドメインが入っていそうなキー（改名・表記ゆれを吸収する） */
const DOMAIN_KEYS = ["domain", "target", "url", "website", "name"] as const;
const MENTIONS_KEYS = ["mentions_count", "mentions", "count", "total_mentions"] as const;
const VOLUME_KEYS = ["ai_search_volume", "search_volume", "volume"] as const;

/**
 * 順位表の応答を読む。**items がどの深さにあっても拾えるように**、
 * tasks[].result[] と result[].items[] の両方を見る。
 *
 * `ownDomains` / `competitorDomains` は自社・競合の印を付けるためだけに使う
 * （並びは DataForSEO の返した順のまま = 引用の多い順）。
 */
export function parseTopDomains(
  payload: unknown,
  brands: { own: readonly string[]; competitors: readonly string[] } = { own: [], competitors: [] },
): MentionsReport | null {
  const root = asRecord(payload);
  const task = asRecord(asArray(root.tasks)[0]);
  const statusCode = num(task.status_code);
  // 40000 以上は DataForSEO 側のエラー（認証・パラメータ違反など）
  if (statusCode !== null && statusCode >= 40000) return null;

  const results = asArray(task.result);
  if (results.length === 0) return null;
  const first = asRecord(results[0]);

  // items は result[0].items にあるのが普通だが、result そのものが行の配列のこともある
  const rawItems = asArray(first.items).length > 0 ? asArray(first.items) : results;

  const own = brands.own.map(normalizeDomain).filter(Boolean);
  const competitors = brands.competitors.map(normalizeDomain).filter(Boolean);
  const matches = (domain: string, list: readonly string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

  const rows: MentionDomainRow[] = [];
  for (const raw of rawItems) {
    const item = asRecord(raw);
    const rawDomain = pickString(item, DOMAIN_KEYS);
    if (!rawDomain) continue;
    const domain = normalizeDomain(rawDomain);
    if (!domain) continue;
    rows.push({
      domain,
      mentions: pickNumber(item, MENTIONS_KEYS) ?? 0,
      aiSearchVolume: pickNumber(item, VOLUME_KEYS),
      isOwn: matches(domain, own),
      isCompetitor: matches(domain, competitors),
    });
  }

  // 1 行も読めなかった = 形が想定と違う。0 件と区別するため null を返す
  if (rows.length === 0) return null;

  const ownIndex = rows.findIndex((r) => r.isOwn);
  return {
    rows,
    totalCount: pickNumber(first, ["total_count", "total_items_count", "items_count"]),
    ownRank: ownIndex >= 0 ? ownIndex + 1 : null,
    costUsd: num(root.cost),
  };
}

/* ───────────── 取得 ───────────── */

export interface TopDomainsRequest {
  /** トピック（業界を表す言葉。例「SEO ツール」） */
  keyword: string;
  platform: MentionPlatform;
  limit?: number;
  languageCode?: string;
  locationCode?: number;
  brands?: { own: readonly string[]; competitors: readonly string[] };
}

export type MentionsFailure = "no-key" | "not-found" | "rate-limit" | "upstream" | "network" | "unreadable";

export interface MentionsOutcome {
  report: MentionsReport | null;
  failure: MentionsFailure | null;
  message: string | null;
}

/** 日本の location_code（DataForSEO の共通コード） */
export const LOCATION_CODE_JP = 2392;

/**
 * 引用されているドメインの順位表を 1 回取る。
 * 失敗しても例外は投げず、理由を付けて返す（画面がそのまま出せるように）。
 */
export async function fetchTopDomains(request: TopDomainsRequest, options: PostOptions = {}): Promise<MentionsOutcome> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(request.limit ?? DEFAULT_LIMIT)));
  let res;
  try {
    res = await postDataForSeo(
      topDomainsPath(),
      {
        keyword: request.keyword,
        platform: request.platform,
        language_code: request.languageCode ?? "ja",
        location_code: request.locationCode ?? LOCATION_CODE_JP,
        limit,
      },
      options,
    );
  } catch {
    return { report: null, failure: "network", message: "DataForSEO に接続できませんでした" };
  }

  if (res.status === 0) {
    return { report: null, failure: "no-key", message: "DataForSEO が未設定です（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）" };
  }
  if (!res.ok) return httpFailure(res.status);

  const report = parseTopDomains(res.payload, request.brands);
  if (!report) {
    return {
      report: null,
      failure: "unreadable",
      message:
        "DataForSEO の応答を解釈できませんでした（このトピックの言及データが無いか、応答の形が変わっています）。" +
        "続くようならパスを GEO_PATH_MENTIONS_TOP_DOMAINS で差し替えてください",
    };
  }
  return { report, failure: null, message: null };
}

function httpFailure(status: number): MentionsOutcome {
  if (status === 401 || status === 403) {
    return { report: null, failure: "no-key", message: "DataForSEO の認証に失敗しました（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD を確認してください）" };
  }
  if (status === 404) {
    return {
      report: null,
      failure: "not-found",
      message: "DataForSEO にそのエンドポイントがありません（HTTP 404）。パスは GEO_PATH_MENTIONS_TOP_DOMAINS で差し替えられます",
    };
  }
  if (status === 429) return { report: null, failure: "rate-limit", message: "DataForSEO の回数制限に達しました" };
  return { report: null, failure: "upstream", message: `DataForSEO がエラーを返しました（HTTP ${status}）` };
}
