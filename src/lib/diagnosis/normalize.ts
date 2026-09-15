/**
 * URL の正規化とクエリの分類（docs/dev/diagnosis-rules-spec.md §6）。純関数。
 *
 * GSC と GA4 では URL の表記が違う（GSC は絶対 URL、GA4 のランディングページは
 * パスだけ）ので、比べる前に揃える。
 *
 * ここでいちばん大事なのは「**統合しない**もの」。`.html` の有無・言語パス・
 * ページネーション・商品 ID は、似ていても別ページであることが多い。勝手に
 * 統合すると「重複コンテンツ」「カニバリゼーション」の誤検出になる（§18）。
 * そのため正規化キーは残し、別途「統合候補」として並べるだけにする。
 */

/** 正規化した URL（比較用のキー） */
export interface NormalizedUrl {
  /** 比較に使うキー。"example.com/service/" のようにスキームと www を落とした形 */
  key: string;
  /** ホスト（www を落とす前の実際の値。U03 の判定に使う） */
  host: string;
  /** パス（末尾スラッシュを揃えたあと） */
  path: string;
  /** 元の入力 */
  raw: string;
  /** https だったか（U08 の判定に使う） */
  https: boolean;
  /** www 付きだったか（U03） */
  www: boolean;
  /** 末尾スラッシュが付いていたか（U02） */
  trailingSlash: boolean;
  /** `.html` などの拡張子（U01）。無ければ null */
  extension: string | null;
  /** 先頭の言語パス（/ja/ → "ja"）。無ければ null（U04） */
  langPrefix: string | null;
}

/** 計測用パラメータ。ページの中身を変えないので落とす */
const TRACKING_PREFIXES = ["utm_", "pk_", "mtm_", "_hs", "hsa_"];
const TRACKING_PARAMS = new Set(["gclid", "gclsrc", "dclid", "wbraid", "gbraid", "fbclid", "msclkid", "yclid", "ttclid", "igshid", "mc_cid", "mc_eid", "_ga", "_gl"]);

const LANG_PREFIX = /^(ja|en|zh|zh-cn|zh-tw|ko|fr|de|es|pt|it|th|vi|id)$/i;

function isTracking(name: string): boolean {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * URL（または GA4 のようなパスだけの文字列）を正規化する。
 *
 * 揃えるもの: スキーム（http / https）、www の有無、ホストの大文字小文字、
 * フラグメント、UTM などの計測パラメータ、末尾スラッシュ。
 * 揃えないもの: `.html` の有無、言語パス、ID、ページネーション、クエリ全部。
 */
export function normalizeUrl(input: string, origin?: string): NormalizedUrl | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, raw.startsWith("/") && origin ? origin : undefined);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const hostRaw = url.hostname.toLowerCase();
  const www = hostRaw.startsWith("www.");
  const host = www ? hostRaw.slice(4) : hostRaw;

  for (const name of [...url.searchParams.keys()]) {
    if (isTracking(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  url.hash = "";

  const rawPath = url.pathname || "/";
  const trailingSlash = rawPath.length > 1 && rawPath.endsWith("/");
  // 末尾スラッシュは「落とす」側に揃える（トップの "/" だけは残す）
  const path = trailingSlash ? rawPath.slice(0, -1) : rawPath;

  const lastSegment = path.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  const extension = dot > 0 ? lastSegment.slice(dot + 1).toLowerCase() : null;

  const firstSegment = path.split("/").filter(Boolean)[0] ?? "";
  const langPrefix = LANG_PREFIX.test(firstSegment) ? firstSegment.toLowerCase() : null;

  const query = url.searchParams.toString();
  return {
    key: `${host}${path || "/"}${query ? `?${query}` : ""}`,
    host: hostRaw,
    path: path || "/",
    raw,
    https: url.protocol === "https:",
    www,
    trailingSlash,
    extension,
    langPrefix,
  };
}

/** 表示用の短いパス（ホストを落とす） */
export function displayPath(input: string): string {
  const n = normalizeUrl(input);
  if (!n) return input;
  return n.path === "/" ? "/（トップ）" : n.path;
}

/** トップページか */
export function isHomePath(path: string): boolean {
  return path === "/" || path === "" || /^\/(index|home)\.(html?|php)$/i.test(path);
}

/**
 * 「統合してよいか分からない」URL の組。§6 の「自動統合しない項目」に当たる
 * ものを見つけたら、統合せずにこの形で並べて人間に確認してもらう。
 */
export interface UrlVariantGroup {
  reason: "extension" | "trailing-slash" | "www" | "lang" | "scheme";
  urls: string[];
}

/** ブランド（指名）語の作り方。ホスト名と、入力されたブランド名から組み立てる */
export function brandTerms(origin: string, brand: string, homeTitle: string | null): string[] {
  const terms = new Set<string>();
  const add = (s: string) => {
    const v = s.trim().toLowerCase();
    if (v.length >= 2) terms.add(v);
  };
  if (brand) add(brand);
  try {
    const host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
    const label = host.split(".")[0];
    if (label && label !== "www") add(label);
  } catch {
    /* origin が URL でなければホストからは作らない */
  }
  // トップページの title の先頭（「株式会社◯◯ | 〜」の◯◯部分）
  if (homeTitle) {
    const head = homeTitle.split(/[|｜\-–—【】/／:：]/)[0] ?? "";
    const cleaned = head.replace(/株式会社|有限会社|合同会社|一般社団法人|公式|サイト|ホームページ/g, "").trim();
    if (cleaned.length >= 2) add(cleaned);
  }
  return [...terms];
}

/** 指名検索か（ブランド語を含むクエリ） */
export function isBrandQuery(query: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return false;
  const q = query.toLowerCase().replace(/\s+/g, "");
  return terms.some((t) => q.includes(t.replace(/\s+/g, "")));
}

/** クエリの意図。Q08〜Q12・Q16〜Q20 の分類に使う */
export type QueryIntent = "price" | "adopt" | "case" | "compare" | "definition" | "problem" | "recruit" | "support" | "place" | "other";

const INTENT_PATTERNS: { intent: QueryIntent; words: RegExp }[] = [
  { intent: "price", words: /費用|価格|料金|いくら|相場|見積|コスト|安い|price|cost/i },
  { intent: "adopt", words: /導入|申込|申し込|購入|注文|発注|契約|依頼|問い合わせ|問合せ/i },
  { intent: "case", words: /事例|実績|導入例|ケース|成功例|口コミ|評判|レビュー/i },
  { intent: "compare", words: /比較|違い|おすすめ|ランキング|vs|どっち|選び方|人気/i },
  { intent: "definition", words: /とは|意味|何ですか|とは\?|そもそも|基礎|入門|わかりやすく/i },
  { intent: "problem", words: /できない|直し方|対処|原因|トラブル|不具合|治し方|解決|困/i },
  { intent: "recruit", words: /求人|採用|募集|転職|年収|新卒|中途|バイト|アルバイト|働き/i },
  { intent: "support", words: /ログイン|マイページ|使い方|マニュアル|設定方法|解約|退会|サポート|問い合わせ先/i },
];

/** 都道府県・主要都市。地名検索（Q18）の判定 */
const PLACE_WORDS =
  /北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄|市$|区$|町$|near me|近く/;

export function queryIntent(query: string): QueryIntent {
  for (const p of INTENT_PATTERNS) {
    if (p.words.test(query)) return p.intent;
  }
  if (PLACE_WORDS.test(query)) return "place";
  return "other";
}

export const QUERY_INTENT_LABELS: Record<QueryIntent, string> = {
  price: "費用・価格",
  adopt: "導入・申し込み",
  case: "事例・評判",
  compare: "比較・検討",
  definition: "「とは」（情報収集）",
  problem: "問題・症状",
  recruit: "採用",
  support: "既存顧客のサポート",
  place: "地名",
  other: "その他",
};
