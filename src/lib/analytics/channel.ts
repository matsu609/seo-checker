/**
 * 参照元（ホスト名）と UTM から流入元を分類する。純粋関数。
 *
 * 生成 AI の判定は GA4 版で使っていた辞書（src/lib/ga4/ai-sources.ts）をそのまま流用する。
 * 検索エンジン・SNS の辞書はここに置く（日本の店舗サイトで実際に出るものだけ）。
 */
import { matchAiSource, normalizeHost } from "@/lib/ga4/ai-sources";
import type { Channel } from "./types";

const SEARCH_ENGINES: readonly { name: string; match: RegExp }[] = [
  { name: "Google", match: /(^|\.)google\.[a-z.]+$/ },
  { name: "Yahoo! JAPAN", match: /(^|\.)yahoo\.co\.jp$/ },
  { name: "Yahoo", match: /(^|\.)yahoo\.com$/ },
  { name: "Bing", match: /(^|\.)bing\.com$/ },
  { name: "DuckDuckGo", match: /(^|\.)duckduckgo\.com$/ },
  { name: "Ecosia", match: /(^|\.)ecosia\.org$/ },
  { name: "Baidu", match: /(^|\.)baidu\.com$/ },
  { name: "Naver", match: /(^|\.)naver\.com$/ },
];

const SOCIAL: readonly { name: string; match: RegExp }[] = [
  { name: "Instagram", match: /(^|\.)instagram\.com$/ },
  { name: "Facebook", match: /(^|\.)(facebook\.com|fb\.com|l\.facebook\.com|lm\.facebook\.com)$/ },
  { name: "X（Twitter）", match: /(^|\.)(x\.com|twitter\.com|t\.co)$/ },
  { name: "LINE", match: /(^|\.)(line\.me|lin\.ee)$/ },
  { name: "YouTube", match: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { name: "TikTok", match: /(^|\.)tiktok\.com$/ },
  { name: "Threads", match: /(^|\.)threads\.(net|com)$/ },
  { name: "Pinterest", match: /(^|\.)pinterest\.[a-z.]+$/ },
  { name: "LinkedIn", match: /(^|\.)linkedin\.com$/ },
  { name: "note", match: /(^|\.)note\.com$/ },
];

const AD_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "display", "cpm", "banner", "ads", "ad"]);
const SOCIAL_MEDIUMS = new Set(["social", "sns"]);

export interface Classified {
  channel: Channel;
  /** チャネルの内訳（検索エンジン名・AI サービス名・SNS 名・参照元ホスト・UTM の source） */
  source: string;
}

/** ホスト名を比べるための正規化（小文字・先頭の www. を落とす） */
export function hostOf(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return normalizeHost(u.hostname);
  } catch {
    return normalizeHost(raw);
  }
}

/**
 * 分類する。
 * - 自サイト（siteHost と同じ）からの参照は internal（セッションの途中の移動）
 * - UTM の medium が広告系なら ad、social 系なら social（参照元より UTM を優先。QR コードや LINE 公式からの流入を拾うため）
 * - 参照元が無ければ direct
 */
export function classify(referrerHost: string, siteHost: string, utm: { source?: string; medium?: string } = {}): Classified {
  const medium = (utm.medium ?? "").trim().toLowerCase();
  const utmSource = (utm.source ?? "").trim();
  if (medium && AD_MEDIUMS.has(medium)) return { channel: "ad", source: utmSource || "広告" };
  if (medium && SOCIAL_MEDIUMS.has(medium)) return { channel: "social", source: utmSource || "SNS" };

  const host = normalizeHost(referrerHost);
  const site = normalizeHost(siteHost);
  if (!host) {
    // 参照元が無くても UTM があればキャンペーン扱い（メール・チラシの QR など）
    if (utmSource) return { channel: "referral", source: utmSource };
    return { channel: "direct", source: "" };
  }
  if (site && (host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`))) return { channel: "internal", source: "" };

  const ai = matchAiSource(host);
  if (ai) return { channel: "ai", source: ai };
  const engine = SEARCH_ENGINES.find((e) => e.match.test(host));
  if (engine) return { channel: "search", source: engine.name };
  const sns = SOCIAL.find((e) => e.match.test(host));
  if (sns) return { channel: "social", source: sns.name };
  return { channel: "referral", source: host };
}
