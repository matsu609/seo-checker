/**
 * ページ診断の Top10 取得（サーバー専用）。
 *
 * 1. SERPAPI_KEY があれば SerpApi の実測（順位・SERP フィーチャー・PAA・AIO）。
 * 2. 無ければ Claude の Web 検索で「推定」の一覧を作る。
 *    推定は順位の実測ではないので `source: "web_search"` を必ず付け、
 *    画面は「推定（Web 検索による）」と明示する。ダミーは作らない。
 */
import { z } from "zod";
import { MODELS, webSearchTool } from "@/lib/llm/anthropic";
import { generateStructured } from "@/lib/llm/structured";
import type { SerpFeature, SerpProvider, SerpRelatedQuestion, SerpResult } from "@/lib/serp/types";
import type { DiagnosisDevice, SerpEntry, SerpSource } from "./types";

/** 取得する上位件数 */
export const TOP_N = 10;

export interface Top10Result {
  source: SerpSource;
  entries: SerpEntry[];
  features: SerpFeature[];
  relatedQuestions: SerpRelatedQuestion[];
  aiOverviewPresent: boolean;
  fetchedAt: string;
}

/** SERP のドメイン（www を落とした形） */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** 自社ドメインに一致する最上位の URL を選ぶ（対象 URL 未指定のとき） */
export function pickSelfUrl(entries: readonly SerpEntry[], domain: string): SerpEntry | null {
  const target = domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "").toLowerCase();
  if (!target) return null;
  for (const entry of entries) {
    const host = hostOf(entry.url);
    if (host === target || host.endsWith(`.${target}`)) return entry;
  }
  return null;
}

/** SerpResult → Top10（実測） */
export function toTop10(serp: SerpResult): Top10Result {
  return {
    source: "serpapi",
    entries: serp.organic.slice(0, TOP_N).map((o, i) => ({
      position: o.position || i + 1,
      title: o.title,
      url: o.url,
      ...(o.snippet ? { snippet: o.snippet } : {}),
    })),
    features: serp.features,
    relatedQuestions: serp.relatedQuestions,
    aiOverviewPresent: Boolean(serp.aiOverview),
    fetchedAt: serp.fetchedAt,
  };
}

export interface SerpFetchInput {
  keyword: string;
  device: DiagnosisDevice;
  location?: string;
  signal?: AbortSignal;
}

/** SerpApi で Top10 を取る */
export async function fetchTop10(provider: SerpProvider, input: SerpFetchInput): Promise<Top10Result> {
  const serp = await provider.search({
    q: input.keyword,
    device: input.device,
    num: 20,
    ...(input.location ? { location: input.location } : {}),
  });
  return toTop10(serp);
}

/* ───────────── Web 検索による推定（SERPAPI_KEY が無いとき） ───────────── */

export const EstimatedSerpSchema = z.object({
  results: z
    .array(
      z.object({
        position: z.number().describe("1 から始まる推定順位"),
        title: z.string().describe("ページのタイトル"),
        url: z.string().describe("ページの URL（http/https から始まる完全な URL）"),
        snippet: z.string().describe("ページの内容を 1〜2 文で"),
      }),
    )
    .max(TOP_N),
  /** 「他の人はこちらも質問」に相当する質問（Web 検索から読み取れた範囲） */
  questions: z.array(z.string()).max(8),
});

export type EstimatedSerp = z.infer<typeof EstimatedSerpSchema>;

export type SerpEstimator = (input: SerpFetchInput) => Promise<EstimatedSerp>;

const ESTIMATE_SYSTEM = [
  "あなたは日本語の検索結果を調べるリサーチャーです。",
  "指定されたキーワードで Google 検索したときに上位に出そうなページを、Web 検索ツールを使って調べて列挙します。",
  "・必ず Web 検索ツールで実際に調べ、検索結果に出てきた実在の URL だけを返してください。URL を推測で作らないでください。",
  "・順位は検索結果の並びから推定したものです。断定できないときも、調べた順に 1 から番号を振ってください。",
  "・同じサイトの同じページを重複して挙げないでください。",
  "・広告・ショッピング枠は除き、通常の検索結果に相当するページだけを対象にしてください。",
].join("\n");

/** 既定の推定器（Claude + Web 検索）。順位の実測ではない */
export const llmSerpEstimator: SerpEstimator = async ({ keyword, device, location, signal }) => {
  const { data } = await generateStructured({
    schema: EstimatedSerpSchema,
    model: "default",
    system: ESTIMATE_SYSTEM,
    maxTokens: 4_000,
    tools: [webSearchTool({ maxUses: 5 })],
    prompt: [
      {
        role: "user",
        content: [
          `検索キーワード: ${keyword}`,
          `デバイス: ${device === "mobile" ? "スマートフォン" : "PC"}`,
          location ? `地域: ${location}` : "地域: 日本全国",
          "",
          `上位 ${TOP_N} 件相当のページと、関連してよく尋ねられる質問を挙げてください。`,
        ].join("\n"),
      },
    ],
    ...(signal ? { signal } : {}),
  });
  return data;
};

/** http/https の URL だけを残し、重複と順位の欠けを整える（純関数） */
export function sanitizeEstimated(raw: EstimatedSerp): { entries: SerpEntry[]; questions: string[] } {
  const entries: SerpEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw.results ?? []) {
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      position: entries.length + 1,
      title: (item.title ?? "").trim() || url,
      ...(item.snippet?.trim() ? { snippet: item.snippet.trim() } : {}),
      url,
    });
    if (entries.length >= TOP_N) break;
  }
  const questions = (raw.questions ?? [])
    .map((q) => (typeof q === "string" ? q.trim() : ""))
    .filter((q, i, list) => q.length > 0 && list.indexOf(q) === i)
    .slice(0, 8);
  return { entries, questions };
}

/** Claude の Web 検索で Top10 を推定する。推定器は差し替え可能 */
export async function estimateTop10(
  input: SerpFetchInput,
  estimator: SerpEstimator = llmSerpEstimator,
): Promise<Top10Result> {
  const raw = await estimator(input);
  const { entries, questions } = sanitizeEstimated(raw);
  return {
    source: "web_search",
    entries,
    // 推定にはフィーチャーの実測が無い。「取れていない」ことを空配列で表す
    features: [],
    relatedQuestions: questions.map((question) => ({ question })),
    aiOverviewPresent: false,
    fetchedAt: new Date().toISOString(),
  };
}

/** 推定に使うモデル（画面の注記用） */
export const ESTIMATE_MODEL = MODELS.default;
