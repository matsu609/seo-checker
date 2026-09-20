/**
 * NAP の正規化と突き合わせ（純粋関数。テストで固定する）。
 *
 * 「表記ゆれ」として許すのは、全角 / 半角・空白・ハイフンの種類・法人格の略記（(株) と 株式会社）・
 * 丁目 / 番地 / 号 の書き方・URL のスキームと末尾のスラッシュ。それ以外の違いは不一致。
 * 住所は「番地まで」と「建物名」を分けて見て、建物名だけの違いは不一致だが軽い扱い（note に書く）。
 */
import { addressCore, normalizeAddress, phoneDigits } from "@/lib/citations/analyze";
import type { FieldCheck, NapField } from "./types";

export { addressCore, normalizeAddress, phoneDigits };

const CORP_ABBR: [RegExp, string][] = [
  [/[(（]株[)）]|㈱/g, "株式会社"],
  [/[(（]有[)）]|㈲/g, "有限会社"],
  [/[(（]合[)）]/g, "合同会社"],
  [/[(（]一社[)）]/g, "一般社団法人"],
  [/[(（]医[)）]/g, "医療法人"],
];

/** 店名の正規化（NFKC・小文字・空白と中黒を除く・法人格の略記をそろえる） */
export function normalizeName(text: string): string {
  let t = text.normalize("NFKC").toLowerCase();
  for (const [re, full] of CORP_ABBR) t = t.replace(re, full);
  return t.replace(/[\s　・･]+/g, "").replace(/[‐‑‒–—―ー－−]/g, "-");
}

/** 法人格（株式会社など）を落とした店名。支店名の判定に使う */
export function stripCorporate(name: string): string {
  return normalizeName(name).replace(/株式会社|有限会社|合同会社|一般社団法人|医療法人|社会福祉法人|学校法人|宗教法人/g, "");
}

/** 店名の照合。候補（ページに書かれていた名前）のうち最も近いものを見る */
export function compareName(expected: string, candidates: readonly string[]): FieldCheck {
  const target = normalizeName(expected);
  if (!target) return { field: "name", status: "skipped", expected, found: null };
  const cleaned = candidates.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return { field: "name", status: "missing", expected, found: null };
  const exact = cleaned.find((c) => normalizeName(c) === target);
  if (exact) return { field: "name", status: "match", expected, found: exact };
  const core = stripCorporate(expected);
  const partial = core.length >= 2 ? cleaned.find((c) => stripCorporate(c).includes(core) || core.includes(stripCorporate(c))) : undefined;
  if (partial) {
    const note = stripCorporate(partial) === core ? "法人格（株式会社など）の有無が違います" : "店名の一部だけが一致（支店名・屋号の付け方が違います）";
    return { field: "name", status: "mismatch", expected, found: partial, note };
  }
  return { field: "name", status: "mismatch", expected, found: cleaned[0], note: "別の名前が書かれています" };
}

/** 本文に店名が出ているか（候補を切り出せないページ用） */
export function nameInText(expected: string, text: string): FieldCheck {
  const target = normalizeName(expected);
  if (!target) return { field: "name", status: "skipped", expected, found: null };
  const hay = normalizeName(text);
  if (hay.includes(target)) return { field: "name", status: "match", expected, found: expected };
  const core = stripCorporate(expected);
  if (core.length >= 2 && hay.includes(core)) return { field: "name", status: "mismatch", expected, found: null, note: "店名の一部（法人格や支店名を除いた部分）だけが見つかります" };
  return { field: "name", status: "missing", expected, found: null };
}

/** 電話番号の表示形（数字だけ → 見やすく。10 桁は 2-4-4 / 3-3-4 の推測はせずそのまま） */
export function formatPhone(digits: string): string {
  if (digits.length === 11 && /^0[789]0/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10 && digits.startsWith("03")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10 && digits.startsWith("06")) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** 電話番号の照合（数字だけで比べる。候補は数字だけの配列） */
export function comparePhone(expected: string, foundDigits: readonly string[]): FieldCheck {
  const target = phoneDigits(expected);
  if (target.length < 10) return { field: "phone", status: "skipped", expected, found: null };
  const uniq = [...new Set(foundDigits.filter((d) => d.length === 10 || d.length === 11))];
  if (uniq.length === 0) return { field: "phone", status: "missing", expected, found: null };
  if (uniq.includes(target)) return { field: "phone", status: "match", expected, found: formatPhone(target) };
  return { field: "phone", status: "mismatch", expected, found: uniq.map(formatPhone).join(" / "), note: uniq.length > 1 ? "複数の番号が書かれていて、どれも入力と違います" : "別の番号が書かれています" };
}

/** 住所の「建物名」部分（番地のあと） */
export function addressBuilding(address: string): string {
  const core = addressCore(address);
  const text = address.normalize("NFKC").replace(/〒?\s*\d{3}-?\d{4}/g, "").replace(/^日本[、,\s]*/, "").trim();
  const idx = core ? text.indexOf(core) : -1;
  const rest = idx >= 0 ? text.slice(idx + core.length) : "";
  return rest.replace(/^[\s、,]+/, "").trim();
}

/** 住所の照合。番地まで一致 → match（建物名が違えば note）。番地が違う → mismatch */
export function compareAddress(expected: string, candidates: readonly string[]): FieldCheck {
  const core = addressCore(expected);
  if (!core || normalizeAddress(core).length < 4) return { field: "address", status: "skipped", expected, found: null };
  const cleaned = candidates.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return { field: "address", status: "missing", expected, found: null };
  const target = normalizeAddress(core);
  const targetNoPref = normalizeAddress(core.replace(/^(?:東京都|北海道|(?:京都|大阪)府|[^\s]{2,3}県)/, ""));
  const same = cleaned.find((c) => {
    const n = normalizeAddress(addressCore(c));
    return n === target || (targetNoPref.length >= 4 && (n === targetNoPref || n.endsWith(targetNoPref)));
  });
  if (same) {
    const b1 = normalizeAddress(addressBuilding(expected));
    const b2 = normalizeAddress(addressBuilding(same));
    // 建物名は前方一致で見る（ページ側に会社名や案内文が続いていることがある）
    if (b1 && b2 && !b1.startsWith(b2) && !b2.startsWith(b1)) return { field: "address", status: "mismatch", expected, found: same, note: `番地までは一致。建物名・階が違います（${addressBuilding(same)} ⇔ ${addressBuilding(expected)}）` };
    if (b1 && !b2) return { field: "address", status: "match", expected, found: same, note: "番地までは一致。建物名・階が書かれていません" };
    return { field: "address", status: "match", expected, found: same };
  }
  const partial = cleaned.find((c) => {
    const n = normalizeAddress(addressCore(c));
    return n.length >= 4 && (target.includes(n) || n.includes(target));
  });
  if (partial) return { field: "address", status: "mismatch", expected, found: partial, note: "番地の書き方が違います（丁目・番地の一部が欠けているか、別の番地）" };
  return { field: "address", status: "mismatch", expected, found: cleaned[0], note: "別の住所が書かれています" };
}

/** URL の正規化（スキーム・www・末尾のスラッシュ・大文字を無視） */
export function normalizeUrl(url: string): { host: string; path: string } | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname.replace(/\/+$/, "").toLowerCase() };
  } catch {
    return null;
  }
}

/** サイト URL の照合。ホストが同じなら一致（パスが違えば note） */
export function compareWebsite(expected: string, candidates: readonly string[]): FieldCheck {
  const target = normalizeUrl(expected);
  if (!target) return { field: "website", status: "skipped", expected, found: null };
  const cleaned = candidates.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) return { field: "website", status: "missing", expected, found: null };
  const parsed = cleaned.map((c) => ({ raw: c, n: normalizeUrl(c) }));
  const sameHost = parsed.find((p) => p.n && p.n.host === target.host);
  if (sameHost && sameHost.n) {
    const note = sameHost.n.path !== target.path ? `ページが違います（${sameHost.n.path || "/"} ⇔ ${target.path || "/"}）` : undefined;
    return { field: "website", status: "match", expected, found: sameHost.raw, ...(note ? { note } : {}) };
  }
  return { field: "website", status: "mismatch", expected, found: cleaned[0], note: "別のサイトが書かれています" };
}

/** 媒体のページに自社サイトへのリンクがあるか（無くても「別のサイト」とは言わない） */
export function websiteInLinks(expected: string, links: readonly string[]): FieldCheck {
  const target = normalizeUrl(expected);
  if (!target) return { field: "website", status: "skipped", expected, found: null };
  const hit = links.find((l) => normalizeUrl(l)?.host === target.host);
  if (hit) return { field: "website", status: "match", expected, found: hit };
  return { field: "website", status: "missing", expected, found: null };
}

/** 比べない項目 */
export function skipped(field: NapField, expected: string): FieldCheck {
  return { field, status: "skipped", expected, found: null };
}
