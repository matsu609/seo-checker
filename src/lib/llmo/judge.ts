/**
 * 言及判定・引用判定（純関数。ネットワークにも localStorage にも触らない）。
 *
 * 判定は 2 つだけ。
 * - ブランド言及: 回答本文を正規化し、会社のブランド別名がそのまま含まれるか
 * - ドメイン引用: 引用 URL のホスト名が会社の登録ドメインか、そのサブドメインか
 *
 * どの会社にも一致しない引用ドメインは「未分類」に集める。競合登録の抜けを
 * 見つけるのが目的なので、捨てずに件数付きで返す。
 */
import type { EntityJudgement, LlmoEntity, ProviderCitation, UnclassifiedDomain } from "./types";

/**
 * 表記ゆれを吸収する正規化。
 * NFKC（全角英数 → 半角、半角カナ → 全角カナ）→ 小文字化 → 空白・中黒・
 * ダッシュ類・句読点の除去。「User Local」「ＵｓｅｒＬｏｃａｌ」「ユーザー・ローカル」を
 * すべて同じ文字列にするため。
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[・･]/g, "")
    // 長音符「ー」は語の一部なので残し、ハイフン・ダッシュ類だけ落とす
    .replace(/[-‐‑‒–—―−]/g, "")
    .replace(/[.,、。()（）「」『』【】/／|｜:：;；'"“”‘’]/g, "");
}

/**
 * URL からホスト名を取り出す（小文字・末尾ドットと先頭 www. を除く）。
 * スキームが無い文字列（"example.com/a"）も受け付ける。
 */
export function hostnameOf(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return normalizeHost(url.hostname);
  } catch {
    return null;
  }
}

/** ホスト名の正規化（小文字・末尾ドット除去・先頭 www. 除去） */
export function normalizeHost(host: string): string | null {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
  return h.length > 0 ? h : null;
}

/** 登録ドメイン文字列（URL でも "www.example.com" でもよい）を正規化する */
export function normalizeEntityDomain(input: string): string | null {
  return hostnameOf(input);
}

/**
 * ホスト名が登録ドメインのいずれかに一致するか。
 * 完全一致に加えてサブドメイン（blog.example.com ⊂ example.com）も一致とみなす。
 * 逆（example.com が blog.example.com に一致）は false。
 */
export function matchesDomain(host: string, domains: readonly string[]): string | null {
  const h = normalizeHost(host);
  if (!h) return null;
  for (const d of domains) {
    const target = normalizeEntityDomain(d);
    if (!target) continue;
    if (h === target || h.endsWith(`.${target}`)) return target;
  }
  return null;
}

/** 回答本文に含まれるブランド別名（正規化後の一致）を返す */
export function matchedAliases(answer: string, aliases: readonly string[]): string[] {
  const haystack = normalizeText(answer);
  if (!haystack) return [];
  const out: string[] = [];
  for (const alias of aliases) {
    const needle = normalizeText(alias);
    // 1 文字の別名は誤検知が多いので採らない
    if (needle.length < 2) continue;
    if (haystack.includes(needle) && !out.includes(alias)) out.push(alias);
  }
  return out;
}

/** 会社 1 社分の判定 */
export function judgeEntity(
  answer: string,
  citations: readonly ProviderCitation[],
  entity: LlmoEntity,
): EntityJudgement {
  const aliases = matchedAliases(answer, entity.brandAliases);
  const matchedDomains: string[] = [];
  for (const c of citations) {
    const host = hostnameOf(c.url);
    if (!host) continue;
    const hit = matchesDomain(host, entity.domains);
    if (hit && !matchedDomains.includes(hit)) matchedDomains.push(hit);
  }
  return {
    entityId: entity.id,
    brandMentioned: aliases.length > 0,
    domainCited: matchedDomains.length > 0,
    matchedDomains,
    matchedAliases: aliases,
  };
}

export interface JudgeResult {
  judgements: EntityJudgement[];
  unclassified: UnclassifiedDomain[];
}

/** 1 回答分の判定（全会社 + 未分類ドメイン） */
export function judgeAnswer(
  answer: string,
  citations: readonly ProviderCitation[],
  entities: readonly LlmoEntity[],
): JudgeResult {
  const judgements = entities.map((e) => judgeEntity(answer, citations, e));
  const buckets = new Map<string, UnclassifiedDomain>();
  for (const c of citations) {
    const host = hostnameOf(c.url);
    if (!host) continue;
    const known = entities.some((e) => matchesDomain(host, e.domains) !== null);
    if (known) continue;
    const found = buckets.get(host);
    if (found) {
      found.count += 1;
    } else {
      buckets.set(host, { domain: host, count: 1, sampleUrl: c.url, sampleTitle: c.title });
    }
  }
  return {
    judgements,
    unclassified: Array.from(buckets.values()).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)),
  };
}
