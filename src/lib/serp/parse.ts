/**
 * SerpApi（engine=google）のレスポンスを SerpResult に変換する純関数。
 * 形は SerpApi のドキュメント（organic_results / ai_overview / related_questions /
 * related_searches）に従うが、欠けているキーがあっても落ちないように読む。
 */
import type {
  SerpAiOverview,
  SerpAiOverviewReference,
  SerpDevice,
  SerpFeature,
  SerpOrganicResult,
  SerpRelatedQuestion,
  SerpResult,
} from "./types";

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

export function parseOrganic(raw: unknown): SerpOrganicResult[] {
  const root = rec(raw);
  const out: SerpOrganicResult[] = [];
  for (const item of arr(root?.organic_results)) {
    const r = rec(item);
    if (!r) continue;
    const url = str(r.link);
    const title = str(r.title);
    if (!url || !title) continue;
    const sitelinks = rec(r.sitelinks);
    const inline = sitelinks ? arr(sitelinks.inline).concat(arr(sitelinks.expanded)) : [];
    const links = inline
      .map((s) => rec(s))
      .filter((s): s is Rec => Boolean(s))
      .map((s) => ({ title: str(s.title) ?? "", url: str(s.link) ?? "" }))
      .filter((s) => s.title && s.url);
    out.push({
      position: num(r.position) ?? out.length + 1,
      title,
      url,
      displayedUrl: str(r.displayed_link),
      snippet: str(r.snippet),
      date: str(r.date),
      ...(links.length > 0 ? { sitelinks: links } : {}),
    });
  }
  return out;
}

/**
 * ai_overview.text_blocks を本文に平坦化する。
 * paragraph → 段落、heading → 「## 見出し」、list → 「- 項目」、table → 行を「 | 」区切り、
 * expandable / comparison など入れ子は再帰。
 */
export function flattenTextBlocks(blocks: unknown, depth = 0): string {
  const lines: string[] = [];
  for (const b of arr(blocks)) {
    const block = rec(b);
    if (!block) continue;
    const type = str(block.type) ?? "paragraph";
    const snippet = str(block.snippet);
    const title = str(block.title);
    switch (type) {
      case "heading":
        if (snippet) lines.push(`## ${snippet}`);
        break;
      case "list": {
        for (const li of arr(block.list)) {
          const item = rec(li);
          if (!item) continue;
          const t = str(item.title);
          const s = str(item.snippet);
          const text = t && s ? `${t}: ${s}` : (t ?? s);
          if (text) lines.push(`- ${text}`);
          const nested = flattenTextBlocks(item.text_blocks ?? item.list, depth + 1);
          if (nested) lines.push(nested.replace(/^/gm, "  "));
        }
        break;
      }
      case "table": {
        for (const row of arr(block.table)) {
          const cells = arr(row).map((c) => str(c) ?? "").filter(Boolean);
          if (cells.length > 0) lines.push(cells.join(" | "));
        }
        break;
      }
      default: {
        if (title && depth === 0 && type !== "paragraph") lines.push(`## ${title}`);
        else if (title && depth > 0) lines.push(title);
        if (snippet) lines.push(snippet);
        const nested = flattenTextBlocks(block.text_blocks, depth + 1);
        if (nested) lines.push(nested);
      }
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseReferences(raw: unknown): SerpAiOverviewReference[] {
  const out: SerpAiOverviewReference[] = [];
  for (const item of arr(raw)) {
    const r = rec(item);
    if (!r) continue;
    const url = str(r.link);
    if (!url) continue;
    out.push({
      url,
      title: str(r.title) ?? url,
      snippet: str(r.snippet),
      source: str(r.source),
      index: num(r.index),
    });
  }
  return out;
}

/**
 * ai_overview → SerpAiOverview。
 * - text_blocks が無く page_token だけのときは null（呼び出し側が google_ai_overview で取り直す）
 * - error があれば null
 */
export function parseAiOverview(raw: unknown): SerpAiOverview | null {
  const ao = rec(raw);
  if (!ao) return null;
  if (ao.error) return null;
  const blocks = arr(ao.text_blocks);
  const references = parseReferences(ao.references);
  if (blocks.length === 0 && references.length === 0) return null;
  const text = flattenTextBlocks(blocks);
  if (!text && references.length === 0) return null;
  return { text, references };
}

/** ai_overview が「本文は別リクエスト」の形か */
export function aiOverviewPageToken(raw: unknown): string | null {
  const ao = rec(rec(raw)?.ai_overview);
  if (!ao) return null;
  if (arr(ao.text_blocks).length > 0) return null;
  return str(ao.page_token) ?? null;
}

export function parseRelatedQuestions(raw: unknown): SerpRelatedQuestion[] {
  const root = rec(raw);
  const out: SerpRelatedQuestion[] = [];
  for (const item of arr(root?.related_questions)) {
    const r = rec(item);
    const question = str(r?.question);
    if (!r || !question) continue;
    out.push({ question, snippet: str(r.snippet), title: str(r.title), url: str(r.link) });
  }
  return out;
}

export function parseRelatedSearches(raw: unknown): string[] {
  const root = rec(raw);
  const out: string[] = [];
  for (const item of arr(root?.related_searches)) {
    const r = rec(item);
    const q = str(r?.query);
    if (q && !out.includes(q)) out.push(q);
  }
  return out;
}

const FEATURE_KEYS: Array<[string, SerpFeature]> = [
  ["ai_overview", "ai_overview"],
  ["answer_box", "answer_box"],
  ["knowledge_graph", "knowledge_graph"],
  ["related_questions", "people_also_ask"],
  ["related_searches", "related_searches"],
  ["local_results", "local_pack"],
  ["local_map", "local_pack"],
  ["shopping_results", "shopping"],
  ["inline_shopping_results", "shopping"],
  ["top_stories", "top_stories"],
  ["inline_videos", "videos"],
  ["video_results", "videos"],
  ["inline_images", "images"],
  ["images_results", "images"],
  ["discussions_and_forums", "discussions"],
  ["twitter_results", "twitter"],
  ["recipes_results", "recipes"],
  ["jobs_results", "jobs"],
  ["events_results", "events"],
  ["ads", "ads"],
];

/** レスポンスに存在するキーから SERP フィーチャーを判定する */
export function detectFeatures(raw: unknown): SerpFeature[] {
  const root = rec(raw);
  if (!root) return [];
  const out: SerpFeature[] = [];
  for (const [key, feature] of FEATURE_KEYS) {
    const v = root[key];
    const present = Array.isArray(v) ? v.length > 0 : Boolean(rec(v)) && !rec(v)?.error;
    if (present && !out.includes(feature)) out.push(feature);
  }
  if (parseOrganic(root).some((o) => o.sitelinks && o.sitelinks.length > 0) && !out.includes("sitelinks")) {
    out.push("sitelinks");
  }
  return out;
}

export function parseTotalResults(raw: unknown): number | null {
  const info = rec(rec(raw)?.search_information);
  return num(info?.total_results) ?? null;
}

export interface ParseContext {
  query: string;
  device: SerpDevice;
  provider?: string;
  fetchedAt?: string;
  /** google_ai_overview で別途取得した本文を差し込む */
  aiOverviewRaw?: unknown;
  /** AIO は表示されていたが本文の取得に失敗した（未取得。「表示なし」ではない） */
  aiOverviewUnavailable?: boolean;
}

/** SerpApi のレスポンス全体 → SerpResult */
export function parseSerpApiResponse(raw: unknown, ctx: ParseContext): SerpResult {
  const root = rec(raw) ?? {};
  const rawAiOverview = ctx.aiOverviewRaw ?? root.ai_overview;
  const aiOverview = parseAiOverview(rawAiOverview);
  // 「AIO の枠は返ってきたが本文を読めなかった」を「表示なし」と混同しない。
  // ai_overview が error だけ・text_blocks が空・page_token を解決できなかった、
  // といった場合はオブジェクト自体は存在するので未取得として扱う。
  // これを表示なしに倒すと、引用率の分母から静かに外れて実態より高く出る。
  const unavailable =
    !aiOverview && (Boolean(ctx.aiOverviewUnavailable) || rec(rawAiOverview) !== null);
  const features = detectFeatures(root);
  if ((aiOverview || unavailable) && !features.includes("ai_overview")) features.unshift("ai_overview");
  if (!aiOverview && !unavailable) {
    const idx = features.indexOf("ai_overview");
    if (idx >= 0) features.splice(idx, 1);
  }
  return {
    query: ctx.query,
    device: ctx.device,
    organic: parseOrganic(root),
    features,
    aiOverview,
    ...(unavailable ? { aiOverviewUnavailable: true } : {}),
    relatedQuestions: parseRelatedQuestions(root),
    relatedSearches: parseRelatedSearches(root),
    totalResults: parseTotalResults(root),
    fetchedAt: ctx.fetchedAt ?? new Date().toISOString(),
    provider: ctx.provider ?? "serpapi",
    raw: ctx.aiOverviewRaw ? { ...root, ai_overview: ctx.aiOverviewRaw } : root,
  };
}
