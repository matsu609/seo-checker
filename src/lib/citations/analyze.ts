/**
 * サイテーションの判定（純関数。ネットワークには出ない）。
 *
 * 入力（店名・電話・住所・サイト）から Google に投げる検索語を組み立て、
 * 検索結果を 1 サイト 1 行にまとめ、タイトル・スニペットに出ている電話番号・住所が
 * 基本情報と一致するかを見る。スニペットは短いので「出ていない」は「載っていない」ではない。
 * 画面ではそのことを必ず添える。
 */
import { LISTING_MEDIA } from "@/lib/listings/media";
import { findKnownSource, SEARCHABLE_MEDIA_IDS } from "./sources";
import type {
  AddressStatus,
  CitationHit,
  CitationInput,
  CitationQuery,
  CitationQueryId,
  CitationReport,
  CitationSourceKind,
  MediaCoverage,
  PhoneStatus,
} from "./types";

/* ───────────── URL ───────────── */

/** ホスト名（小文字・www. 抜き）。URL として読めなければ "" */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

/** 自社サイトの URL（https:// 無しでも可）→ ホスト名。空なら null */
export function ownHostOf(website: string): string | null {
  const raw = website.trim();
  if (!raw) return null;
  const host = hostOf(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  return host || null;
}

export function isOwnHost(host: string, ownHost: string | null): boolean {
  if (!ownHost || !host) return false;
  return host === ownHost || host.endsWith(`.${ownHost}`) || ownHost.endsWith(`.${host}`);
}

/* ───────────── 電話番号 ───────────── */

/** 数字だけにする。+81 は 0 に読み替える（"+81 3-1234-5678" → "0312345678"） */
export function phoneDigits(raw: string): string {
  let digits = raw.normalize("NFKC").replace(/[^0-9+]/g, "");
  if (digits.startsWith("+81")) digits = `0${digits.slice(3)}`;
  return digits.replace(/\+/g, "");
}

const PHONE_PATTERN = /(?:\+81[\s-]?|0)[\d\s()-]{8,13}\d/g;

/** 文中の電話番号らしいもの（日本の 10〜11 桁）を数字だけの形で返す（重複なし） */
export function phoneCandidates(text: string): string[] {
  const out = new Set<string>();
  const normalized = text.normalize("NFKC");
  for (const m of normalized.match(PHONE_PATTERN) ?? []) {
    const digits = phoneDigits(m);
    if (digits.length === 10 || digits.length === 11) out.add(digits);
  }
  return [...out];
}

export function phoneStatus(text: string, profilePhone: string): PhoneStatus {
  const target = phoneDigits(profilePhone);
  if (target.length < 10) return "absent";
  const candidates = phoneCandidates(text);
  if (candidates.includes(target)) return "match";
  return candidates.length > 0 ? "mismatch" : "absent";
}

/* ───────────── 住所 ───────────── */

const PREFECTURE = /^(?:東京都|北海道|(?:京都|大阪)府|[^\s]{2,3}県)/;
/**
 * 最初の数字から続く「番地の並び」: 数字 + 単位（丁目 / 番地 / 番 / 号 / 条（+ 東西南北））+ 区切り、の繰り返し。
 * "1-1-1" "1丁目1番1号" "北1条西2-3" は取り、空白や建物名で止まる。
 */
const ADDRESS_TAIL = /^(?:[0-9]+(?:条[東西南北]?|丁目|番地|番|号)?[-‐‑‒–—―ー－−]?)+/;

/** 郵便番号・「日本」を落として前後の空白を除く */
function stripPostal(address: string): string {
  return address
    .normalize("NFKC")
    .replace(/〒?\s*\d{3}-?\d{4}/g, "")
    .replace(/^日本[、,\s]*/, "")
    .trim();
}

/**
 * 住所の「番地まで」（建物名・階を落とす）。
 * "東京都千代田区丸の内1-1-1 パレスビル3F" → "東京都千代田区丸の内1-1-1"
 * 数字が無い住所（"一丁目" など漢数字）はそのまま返す。
 */
export function addressCore(address: string): string {
  const text = stripPostal(address);
  const first = text.search(/[0-9]/);
  if (first < 0) return text;
  const tail = ADDRESS_TAIL.exec(text.slice(first))?.[0] ?? "";
  return text
    .slice(0, first + tail.length)
    .replace(/[-‐‑‒–—―ー－−]$/, "")
    .trim();
}

/** 都道府県を落とした番地まで（検索語に使う。短いほど一致しやすい） */
export function addressPhrase(address: string): string {
  return addressCore(address).replace(PREFECTURE, "").trim();
}

/** 比べる前の正規化（空白・ハイフンの種類・丁目 / 番地 / 号の表記の違いを吸収） */
export function normalizeAddress(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[‐‑‒–—―ー－−]/g, "-")
    .replace(/丁目|番地|番/g, "-")
    .replace(/号/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "")
    .toLowerCase();
}

export function addressStatus(text: string, profileAddress: string): AddressStatus {
  const core = addressCore(profileAddress);
  if (!core) return "absent";
  const variants = [normalizeAddress(core), normalizeAddress(addressPhrase(profileAddress))].filter((v) => v.length >= 4);
  if (variants.length === 0) return "absent";
  const haystack = normalizeAddress(text);
  return variants.some((v) => haystack.includes(v)) ? "match" : "absent";
}

/* ───────────── 検索語 ───────────── */

const QUERY_LABELS: Record<CitationQueryId, string> = {
  phone: "店名 + 電話番号",
  address: "店名 + 住所",
  name: "店名（自社サイト以外）",
};

function quote(text: string): string {
  return `"${text.replace(/"/g, "").trim()}"`;
}

/** 入力から検索語を組み立てる。電話・住所が空ならその検索は results: null（未実行）で返す */
export function buildQueries(input: CitationInput): CitationQuery[] {
  const name = input.name.trim();
  const ownHost = ownHostOf(input.website);
  const phone = input.phone.trim();
  const address = addressPhrase(input.address);
  const queries: CitationQuery[] = [
    { id: "phone", label: QUERY_LABELS.phone, q: phone ? `${quote(name)} ${quote(phone)}` : "", results: null, error: null },
    { id: "address", label: QUERY_LABELS.address, q: address ? `${quote(name)} ${quote(address)}` : "", results: null, error: null },
    { id: "name", label: QUERY_LABELS.name, q: ownHost ? `${quote(name)} -site:${ownHost}` : quote(name), results: null, error: null },
  ];
  return queries;
}

/* ───────────── 集計 ───────────── */

export interface RawSerpHit {
  url: string;
  title: string;
  snippet: string;
  /** 1 始まり */
  position: number;
}

export interface QueryOutcome {
  id: CitationQueryId;
  hits: RawSerpHit[];
  /** 取得に失敗した理由。成功なら null */
  error: string | null;
}

export function classifyHost(host: string, path: string, ownHost: string | null): { kind: CitationSourceKind; sourceLabel: string | null; mediaId: string | null } {
  if (isOwnHost(host, ownHost)) return { kind: "own", sourceLabel: null, mediaId: null };
  const known = findKnownSource(host, path);
  if (known) return { kind: known.kind, sourceLabel: known.label, mediaId: known.mediaId ?? null };
  return { kind: "other", sourceLabel: null, mediaId: null };
}

const PHONE_RANK: Record<PhoneStatus, number> = { match: 2, mismatch: 1, absent: 0 };

function betterPhone(a: PhoneStatus, b: PhoneStatus): PhoneStatus {
  return PHONE_RANK[a] >= PHONE_RANK[b] ? a : b;
}

/** 検索結果を 1 サイト 1 行にまとめる。自社サイトは最後、ほかは上位に出た順 */
export function mergeHits(input: CitationInput, outcomes: readonly QueryOutcome[]): CitationHit[] {
  const ownHost = ownHostOf(input.website);
  const byHost = new Map<string, CitationHit>();
  for (const outcome of outcomes) {
    for (const raw of outcome.hits) {
      const host = hostOf(raw.url);
      if (!host) continue;
      const text = `${raw.title}\n${raw.snippet}`;
      const phone = phoneStatus(text, input.phone);
      const address = addressStatus(text, input.address);
      const existing = byHost.get(host);
      if (existing) {
        existing.pages += 1;
        if (!existing.foundBy.includes(outcome.id)) existing.foundBy.push(outcome.id);
        existing.phone = betterPhone(existing.phone, phone);
        if (address === "match") existing.address = "match";
        if (raw.position < existing.bestPosition) {
          existing.bestPosition = raw.position;
          existing.url = raw.url;
          existing.title = raw.title;
          existing.snippet = raw.snippet;
        }
        continue;
      }
      const cls = classifyHost(host, pathOf(raw.url), ownHost);
      byHost.set(host, {
        domain: host,
        url: raw.url,
        title: raw.title,
        snippet: raw.snippet,
        kind: cls.kind,
        sourceLabel: cls.sourceLabel,
        mediaId: cls.mediaId,
        foundBy: [outcome.id],
        phone,
        address,
        bestPosition: raw.position,
        pages: 1,
      });
    }
  }
  return [...byHost.values()].sort((a, b) => {
    if ((a.kind === "own") !== (b.kind === "own")) return a.kind === "own" ? 1 : -1;
    return b.foundBy.length - a.foundBy.length || a.bestPosition - b.bestPosition || a.domain.localeCompare(b.domain);
  });
}

/** 主要媒体（通常の検索結果に出るものだけ）の掲載状況 */
export function mediaCoverage(hits: readonly CitationHit[]): MediaCoverage[] {
  return LISTING_MEDIA.filter((m) => m.kind === "self" && SEARCHABLE_MEDIA_IDS.includes(m.id))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "ja"))
    .map((m) => {
      const hit = hits.find((h) => h.mediaId === m.id) ?? null;
      return { mediaId: m.id, name: m.name, priority: m.priority, registerUrl: m.url, found: hit !== null, url: hit?.url ?? null };
    });
}

export function buildReport(input: CitationInput, queries: readonly CitationQuery[], outcomes: readonly QueryOutcome[], generatedAt: string): CitationReport {
  const hits = mergeHits(input, outcomes);
  const coverage = mediaCoverage(hits);
  const others = hits.filter((h) => h.kind !== "own");
  const filledQueries = queries.map((q) => {
    const outcome = outcomes.find((o) => o.id === q.id);
    if (!outcome) return q;
    return { ...q, results: outcome.error ? null : outcome.hits.length, error: outcome.error };
  });
  return {
    input,
    queries: filledQueries,
    hits,
    coverage,
    summary: {
      sites: others.length,
      phoneMatch: others.filter((h) => h.phone === "match").length,
      phoneMismatch: others.filter((h) => h.phone === "mismatch").length,
      addressMatch: others.filter((h) => h.address === "match").length,
      ownFound: hits.some((h) => h.kind === "own"),
      mediaFound: coverage.filter((c) => c.found).length,
      mediaTotal: coverage.length,
    },
    generatedAt,
  };
}
