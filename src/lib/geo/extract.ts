/**
 * 引用と参照の抽出（仕様書 §3.1 / §4.2 / §4.3）。
 *
 * **1 回の計測から、追加の API 費用なしで 2 つの指標を取る。**
 *   引用 (citation) … 回答のソース欄・インラインリンクに対象ドメインが含まれる
 *   参照 (mention)  … 回答本文にブランド名（エイリアス含む）が出現。リンクの有無は問わない
 *
 * 参照判定は単純な文字列一致だと「アップル（果物）」「レイク（湖）」のような
 * 一般名詞や同名他社を拾ってしまう。そこで **候補は文字列で絞り、最終判定は
 * 軽量 LLM に文脈で確かめさせる**（§4.2）。confidence を持たせ、低いものは
 * 自動で捨てずに「要確認」として画面に出す。
 *
 * LLM が使えない環境では文字列一致の結果をそのまま返す（confidence を下げる）。
 */
import { z } from "zod";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { generateStructured } from "@/lib/llm/structured";
import { untrustedLines } from "@/lib/page-diagnosis/analyze";
import { matchesDomain, normalizeText } from "./normalize";
import type { DomainClass, GeoBrand, GeoCitation } from "./types";

/** 文字列一致だけで判定したときの確信度（LLM が使えないときの上限） */
export const STRING_MATCH_CONFIDENCE = 0.6;
/** これを下回ったら画面に「要確認」を出す */
export const REVIEW_THRESHOLD = 0.7;

export interface BrandHit {
  brandId: string;
  mentioned: boolean;
  confidence: number;
  /** 本文中で最初に出た位置（文字数。出てこなければ null） */
  position: number | null;
  /** 一致したエイリアス */
  matched: string | null;
}

/**
 * 文字列一致で候補を探す（前段）。正規化してから探すので全角半角を吸収する。
 * ここで見つからなければ LLM にも聞かない（費用を使わない）。
 */
export function findAliasCandidates(text: string, brand: GeoBrand): BrandHit {
  const haystack = normalizeText(text);
  let best: { position: number; alias: string } | null = null;
  for (const alias of [brand.displayName, ...brand.aliases]) {
    const needle = normalizeText(alias);
    if (!needle) continue;
    const index = haystack.indexOf(needle);
    if (index >= 0 && (best === null || index < best.position)) best = { position: index, alias };
  }
  return best === null
    ? { brandId: brand.id, mentioned: false, confidence: 1, position: null, matched: null }
    : { brandId: brand.id, mentioned: true, confidence: STRING_MATCH_CONFIDENCE, position: best.position, matched: best.alias };
}

/** 引用の判定（§3.1）。ドメインの一致だけで決まるので LLM は要らない */
export function judgeCitation(citations: readonly GeoCitation[], brand: GeoBrand): { cited: boolean; domains: string[] } {
  const matched = citations
    .filter((c) => !c.unresolved && brand.domains.some((d) => matchesDomain(c.domain, d)))
    .map((c) => c.domain);
  return { cited: matched.length > 0, domains: [...new Set(matched)] };
}

/** 引用ドメインを自社 / 競合 / 第三者に分ける（§4.3） */
export function classifyDomain(domain: string, own: GeoBrand, competitors: readonly GeoBrand[]): DomainClass {
  if (own.domains.some((d) => matchesDomain(domain, d))) return "own";
  if (competitors.some((c) => c.domains.some((d) => matchesDomain(domain, d)))) return "competitor";
  return "third_party";
}

/** 引用元の構成比（§3.2「引用元構成比」） */
export function citationMix(
  citations: readonly GeoCitation[],
  own: GeoBrand,
  competitors: readonly GeoBrand[],
): Record<DomainClass, number> {
  const mix: Record<DomainClass, number> = { own: 0, competitor: 0, third_party: 0 };
  for (const c of citations) {
    if (c.unresolved) continue;
    mix[classifyDomain(c.domain, own, competitors)] += 1;
  }
  return mix;
}

/* ───────────── 軽量 LLM による文脈判定（§4.2） ───────────── */

const JudgementSchema = z.object({
  results: z.array(
    z.object({
      brand: z.string().describe("判定したブランド名（渡したものをそのまま）"),
      mentioned: z.boolean().describe("その回答が、このブランド（企業・サービス）を指して言及しているか"),
      confidence: z.number().describe("0〜1 の確信度。同名の一般名詞や別会社と紛らわしいときは下げる"),
      reason: z.string().describe("判断の理由を 1 文で"),
    }),
  ),
});

const SYSTEM = `あなたはテキストからブランドへの言及を判定する担当者です。日本語で答えます。

守ること:
- 渡された回答本文の中で、その語が「その企業・サービスそのもの」を指しているかだけを見ます。
- 同じつづりの一般名詞（例: 「リンク」「アップル」）、別の会社の同名サービス、人名は mentioned: false にします。
- 肯定的に紹介されているか否かは関係ありません。名前が出ていれば言及です（リンクの有無も問いません）。
- 迷う場合は mentioned をそのままにし、confidence を下げてください。勝手に切り捨てません。`;

export interface JudgeOptions {
  signal?: AbortSignal;
}

/**
 * 文字列で見つかった候補だけを LLM に確かめさせる。
 * 候補が無ければ LLM を呼ばない（費用ゼロ）。
 */
export async function judgeMentions(
  responseText: string,
  brands: readonly GeoBrand[],
  options: JudgeOptions = {},
): Promise<BrandHit[]> {
  const hits = brands.map((brand) => findAliasCandidates(responseText, brand));
  const candidates = hits.filter((h) => h.mentioned);
  if (candidates.length === 0 || !isAnthropicEnabled()) return hits;

  const byName = new Map(brands.map((b) => [b.displayName, b.id]));
  try {
    const { data } = await generateStructured({
      schema: JudgementSchema,
      system: SYSTEM,
      prompt: [
        "次の回答本文に、以下のブランドが「その企業・サービスとして」言及されているか判定してください。",
        "",
        `ブランド: ${candidates.map((c) => brands.find((b) => b.id === c.brandId)?.displayName ?? "").filter(Boolean).join(" / ")}`,
        "",
        "回答本文:",
        ...untrustedLines(responseText.split("\n")),
      ].join("\n"),
      model: "fast",
      maxTokens: 1024,
      signal: options.signal,
    });

    const judged = new Map<string, { mentioned: boolean; confidence: number }>();
    for (const row of data.results) {
      const id = byName.get(row.brand);
      if (id) judged.set(id, { mentioned: row.mentioned, confidence: clamp01(row.confidence) });
    }
    return hits.map((hit) => {
      const j = judged.get(hit.brandId);
      if (!hit.mentioned || !j) return hit;
      return { ...hit, mentioned: j.mentioned, confidence: j.confidence, position: j.mentioned ? hit.position : null };
    });
  } catch {
    // LLM が落ちても計測は捨てない。文字列一致の結果をそのまま使う
    return hits;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** 「要確認」フラグ（§4.2）。自動では除外しない */
export function needsReview(hit: BrandHit): boolean {
  return hit.mentioned && hit.confidence < REVIEW_THRESHOLD;
}
