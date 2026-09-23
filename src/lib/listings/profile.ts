/**
 * 基本情報掲載の「正」となる店舗の基本情報（NAP: Name / Address / Phone + サイト・営業時間・説明文）と、
 * 媒体ごとの掲載状況。クライアントでも読める純粋な型と関数。
 *
 * すべての媒体にここと同じ内容を載せる（表記ゆれが無いことが、地図・検索・生成 AI に正しく認識される条件）。
 */
import { z } from "zod";
import type { PlaceDetail } from "@/lib/maps/types";
import { sameAddress, sameName, samePhone, sameWebsite } from "@/lib/nap/compare";
import { LISTING_MEDIA, type ListingMedia } from "./media";

export const NAME_MAX = 100;
export const CATEGORY_MAX = 60;
export const ADDRESS_MAX = 200;
export const POSTAL_MAX = 10;
export const PHONE_MAX = 30;
export const URL_MAX = 300;
export const EMAIL_MAX = 200;
export const HOURS_MAX = 400;
export const SHORT_DESCRIPTION_MAX = 150;
export const LONG_DESCRIPTION_MAX = 750;
export const LISTING_URL_MAX = 500;
export const LISTING_NOTE_MAX = 200;

export const ListingProfileSchema = z.object({
  name: z.string().trim().max(NAME_MAX).default(""),
  /** ふりがな（Yahoo!プレイスなど日本の媒体で要る） */
  nameKana: z.string().trim().max(NAME_MAX).default(""),
  category: z.string().trim().max(CATEGORY_MAX).default(""),
  postalCode: z.string().trim().max(POSTAL_MAX).default(""),
  address: z.string().trim().max(ADDRESS_MAX).default(""),
  phone: z.string().trim().max(PHONE_MAX).default(""),
  website: z.string().trim().max(URL_MAX).default(""),
  email: z.string().trim().max(EMAIL_MAX).default(""),
  /** 曜日ごとの営業時間（1 行 1 曜日。「月曜日: 10:00〜19:00」など） */
  hours: z.string().trim().max(HOURS_MAX).default(""),
  /** 短い説明（150 文字。ディレクトリの一覧に出る） */
  shortDescription: z.string().trim().max(SHORT_DESCRIPTION_MAX).default(""),
  /** 長い説明（750 文字。Google / Yahoo! / Apple の説明文） */
  longDescription: z.string().trim().max(LONG_DESCRIPTION_MAX).default(""),
});
export type ListingProfile = z.infer<typeof ListingProfileSchema>;

export const LISTING_STATUSES = ["todo", "submitted", "live", "skip"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  todo: "未登録",
  submitted: "申請中",
  live: "掲載済み",
  skip: "対象外",
};

export const ListingStateSchema = z.object({
  status: z.enum(LISTING_STATUSES).default("todo"),
  /** 掲載ページの URL（掲載後に控える） */
  url: z.string().trim().max(LISTING_URL_MAX).default(""),
  note: z.string().trim().max(LISTING_NOTE_MAX).default(""),
  updatedAt: z.string().nullable().default(null),
  /** 掲載の再チェック（r127）。掲載済みで URL がある媒体だけ、月 1 回ページを開いて確かめる */
  lastCheckedAt: z.string().nullable().optional(),
  nextCheckAt: z.string().nullable().optional(),
  check: z
    .object({
      result: z.enum(["ok", "mismatch", "missing", "error"]),
      detail: z.string().max(300),
      found: z.object({ name: z.boolean(), phone: z.boolean(), address: z.boolean() }),
    })
    .nullable()
    .optional(),
});
export type ListingState = z.infer<typeof ListingStateSchema>;

/** 媒体 id → 状況（無い媒体は「未登録」扱い） */
export const ListingStatesSchema = z.record(z.string(), ListingStateSchema);
export type ListingStates = z.infer<typeof ListingStatesSchema>;

export function emptyProfile(): ListingProfile {
  return ListingProfileSchema.parse({});
}

export function stateOf(states: ListingStates, mediaId: string): ListingState {
  return states[mediaId] ?? ListingStateSchema.parse({});
}

/** 掲載状況の集計（自分で登録できる媒体と、全体） */
export function summarizeStates(states: ListingStates, media: readonly ListingMedia[] = LISTING_MEDIA): { live: number; submitted: number; todo: number; total: number; selfLive: number; selfTotal: number } {
  let live = 0;
  let submitted = 0;
  let todo = 0;
  let total = 0;
  let selfLive = 0;
  let selfTotal = 0;
  for (const x of media) {
    const s = stateOf(states, x.id).status;
    if (s === "skip") continue;
    total += 1;
    if (s === "live") live += 1;
    else if (s === "submitted") submitted += 1;
    else todo += 1;
    if (x.kind === "self") {
      selfTotal += 1;
      if (s === "live") selfLive += 1;
    }
  }
  return { live, submitted, todo, total, selfLive, selfTotal };
}

/** Google マップの公開情報（MEO の報告書）→ 基本情報の初期値。空欄だけを埋める */
export function prefillFromGoogle(profile: ListingProfile, detail: Pick<PlaceDetail, "name" | "address" | "phone" | "website" | "hours" | "category">): ListingProfile {
  return {
    ...profile,
    name: profile.name || detail.name,
    category: profile.category || detail.category || "",
    address: profile.address || (detail.address ?? ""),
    phone: profile.phone || (detail.phone ?? ""),
    website: profile.website || (detail.website ?? ""),
    hours: profile.hours || detail.hours.join("\n"),
  };
}

/**
 * 設定の「会社・店舗の基本情報」（登録時のデータ）で空欄を埋める。
 * 入っている値は上書きしない（Google から取り込んだ値や利用者が直した値が優先）。
 */
export function prefillFromBusiness(
  profile: ListingProfile,
  lead: { company: string; phone: string; address: string; storeType: string } | null,
): ListingProfile {
  if (!lead) return profile;
  const next = {
    ...profile,
    name: profile.name || lead.company,
    phone: profile.phone || lead.phone,
    address: profile.address || lead.address,
    category: profile.category || lead.storeType,
  };
  return next.name === profile.name && next.phone === profile.phone && next.address === profile.address && next.category === profile.category ? profile : next;
}

/** 比べる前の正規化（全角 / 半角、空白、ハイフンの種類、末尾スラッシュの違いは表記ゆれと見なさない） */
export function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[‐‑‒–—―ー－−]/g, "-")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export interface NapMismatch {
  field: "name" | "address" | "phone" | "website";
  label: string;
  profile: string;
  google: string;
}

const SAME_BY_FIELD: Record<NapMismatch["field"], (a: string, b: string) => boolean> = {
  name: sameName,
  address: sameAddress,
  phone: samePhone,
  website: sameWebsite,
};

/**
 * 基本情報と Google マップの公開情報のずれ（どちらかが空なら比べない）。
 * 判定は NAP チェックと同じ（src/lib/nap/compare.ts）。2026-09-23 までは全角 / 半角・空白・ハイフンしか
 * そろえておらず、「0312345678」と「03-1234-5678」や、丁目 / 番地の書き方の違いを「ずれ」と出していた。
 */
export function compareNap(profile: ListingProfile, detail: Pick<PlaceDetail, "name" | "address" | "phone" | "website">): NapMismatch[] {
  const pairs: { field: NapMismatch["field"]; label: string; a: string; b: string | null }[] = [
    { field: "name", label: "店名", a: profile.name, b: detail.name },
    { field: "address", label: "住所", a: profile.address, b: detail.address },
    { field: "phone", label: "電話番号", a: profile.phone, b: detail.phone },
    { field: "website", label: "サイト", a: profile.website, b: detail.website },
  ];
  const out: NapMismatch[] = [];
  for (const p of pairs) {
    if (!p.a || !p.b) continue;
    if (SAME_BY_FIELD[p.field](p.a, p.b)) continue;
    out.push({ field: p.field, label: p.label, profile: p.a, google: p.b });
  }
  return out;
}

/** 貼り付け用のまとめ（各媒体の登録画面にコピーする） */
export function profileToText(profile: ListingProfile): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => {
    if (value.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  add("店名", profile.name);
  add("ふりがな", profile.nameKana);
  add("業種", profile.category);
  add("郵便番号", profile.postalCode);
  add("住所", profile.address);
  add("電話番号", profile.phone);
  add("サイト", profile.website);
  add("メール", profile.email);
  if (profile.hours.trim()) lines.push(`営業時間:\n${profile.hours.trim()}`);
  if (profile.shortDescription.trim()) lines.push(`短い説明:\n${profile.shortDescription.trim()}`);
  if (profile.longDescription.trim()) lines.push(`説明文:\n${profile.longDescription.trim()}`);
  return lines.join("\n");
}

/* ───────────── 営業時間 → schema.org ───────────── */

const DAY_CODES: Record<string, string> = {
  月: "Monday", 火: "Tuesday", 水: "Wednesday", 木: "Thursday", 金: "Friday", 土: "Saturday", 日: "Sunday",
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function toHHMM(h: string, m: string | undefined, suffix: string | undefined): string | null {
  let hour = Number.parseInt(h, 10);
  if (Number.isNaN(hour)) return null;
  if (suffix && /pm/i.test(suffix) && hour < 12) hour += 12;
  if (suffix && /am/i.test(suffix) && hour === 12) hour = 0;
  if (hour > 24) return null;
  const minute = m ? Number.parseInt(m, 10) : 0;
  return `${String(hour).padStart(2, "0")}:${String(Math.min(minute, 59)).padStart(2, "0")}`;
}

export interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_TOKEN_RE = /^(?:([月火水木金土日])(?:曜日?)?|(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b)/i;
const DAY_RANGE_SEP_RE = /^\s*(?:[~〜～\-–—]|to\b)\s*/i;
const DAY_LIST_SEP_RE = /^\s*(?:[・,、/&]|and\b)?\s*/i;
const CLOSED_RE = /定休|休業|休み|closed/i;
const ALL_DAY_RE = /24\s*時間|open 24 hours/i;
const RANGE_RE = /(\d{1,2})(?:[:時](\d{2})?分?)?\s*(am|pm)?\s*[~〜～\-–—]\s*(\d{1,2})(?:[:時](\d{2})?分?)?\s*(am|pm)?/gi;

function dayCode(m: RegExpExecArray): string | undefined {
  return DAY_CODES[(m[1] ?? m[2] ?? "").toLowerCase()];
}

/** 月曜から順に a〜b（金〜月 のように週をまたいでもよい） */
function dayRange(a: string, b: string): string[] {
  const i = WEEK.indexOf(a as (typeof WEEK)[number]);
  const j = WEEK.indexOf(b as (typeof WEEK)[number]);
  const out: string[] = [];
  for (let k = 0; k <= (j - i + 7) % 7; k++) out.push(WEEK[(i + k) % 7]!);
  return out;
}

/**
 * 行頭の曜日（「月曜日」「月〜金」「土日」「土・日」「Mon - Fri」）→ 曜日の並びと残りの文字列。
 * 曜日で始まらなければ null。
 */
function readDays(t: string): { days: string[]; rest: string } | null {
  const first = DAY_TOKEN_RE.exec(t);
  if (!first) return null;
  const firstDay = dayCode(first);
  if (!firstDay) return null;
  const days = [firstDay];
  let rest = t.slice(first[0].length);
  for (;;) {
    const range = DAY_RANGE_SEP_RE.exec(rest);
    const afterRange = range ? DAY_TOKEN_RE.exec(rest.slice(range[0].length)) : null;
    if (range && afterRange) {
      const to = dayCode(afterRange);
      if (!to) break;
      days.push(...dayRange(days[days.length - 1]!, to).slice(1));
      rest = rest.slice(range[0].length + afterRange[0].length);
      continue;
    }
    const list = DAY_LIST_SEP_RE.exec(rest);
    const afterList = DAY_TOKEN_RE.exec(rest.slice(list?.[0].length ?? 0));
    if (afterList) {
      const next = dayCode(afterList);
      if (!next) break;
      days.push(next);
      rest = rest.slice((list?.[0].length ?? 0) + afterList[0].length);
      continue;
    }
    break;
  }
  return { days: [...new Set(days)], rest };
}

/**
 * 1 行の読み取り結果。
 * - closed = 定休日と読めた行
 * - unreadable = 曜日か時間帯を含むのに読み切れなかった行（Google に送ると曜日が「休業」になるので止める）
 * - none = 曜日も時間帯も無い行（注記。読み飛ばしてよい）
 */
type HoursLineResult = { kind: "open"; specs: OpeningHoursSpec[] } | { kind: "closed" } | { kind: "unreadable" } | { kind: "none" };

function readHoursLine(line: string): HoursLineResult {
  const t = line.normalize("NFKC").trim();
  if (!t) return { kind: "none" };
  const head = readDays(t);
  if (!head) return new RegExp(RANGE_RE.source, "i").test(t) ? { kind: "unreadable" } : { kind: "none" };
  const { days, rest } = head;
  if (CLOSED_RE.test(rest)) return { kind: "closed" };
  const ranges: { opens: string; closes: string }[] = [];
  if (ALL_DAY_RE.test(rest)) {
    ranges.push({ opens: "00:00", closes: "24:00" });
  } else {
    for (const mm of rest.matchAll(RANGE_RE)) {
      const opens = toHHMM(mm[1]!, mm[2], mm[3]);
      const closes = toHHMM(mm[4]!, mm[5], mm[6]);
      if (!opens || !closes) return { kind: "unreadable" };
      ranges.push({ opens, closes });
    }
  }
  if (ranges.length === 0) return { kind: "unreadable" };
  return {
    kind: "open",
    specs: days.flatMap((dayOfWeek) => ranges.map((r) => ({ "@type": "OpeningHoursSpecification" as const, dayOfWeek, ...r }))),
  };
}

/**
 * 「月曜日: 10時00分～19時00分」「Mon: 10:00 – 19:00」のような 1 行 → schema.org の形。
 * **1 行に時間帯が複数あれば全部返す**（Google の「11時30分～14時00分、17時00分～22時00分」。
 * 以前は最初の 1 つだけを読み、夜の営業時間を落としていた）。
 * 「月〜金」「土日」のような曜日のまとめ書きは曜日ごとに展開する（以前は先頭の曜日だけだった）。
 * 「24 時間営業」は 00:00〜24:00。定休日・読めない行は空配列（純粋関数）。
 */
export function parseHoursLine(line: string): OpeningHoursSpec[] {
  const r = readHoursLine(line);
  return r.kind === "open" ? r.specs : [];
}

/**
 * 営業時間の欄（改行区切り）全体 → schema.org の形と、読めなかった行。
 * Google への送信は「読めない行が 1 つでもあれば送らない」に使う
 * （regularHours は丸ごと置き換えなので、読めなかった曜日が「休業」になってしまう）。
 */
export function parseHoursText(text: string): { specs: OpeningHoursSpec[]; unreadable: string[] } {
  const specs: OpeningHoursSpec[] = [];
  const unreadable: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const r = readHoursLine(line);
    if (r.kind === "open") specs.push(...r.specs);
    else if (r.kind === "unreadable") unreadable.push(line.trim());
  }
  return { specs, unreadable };
}

/** サイトに貼る構造化データ（schema.org LocalBusiness。生成 AI と検索エンジンが基本情報を読む） */
export function toJsonLd(profile: ListingProfile): Record<string, unknown> {
  const out: Record<string, unknown> = { "@context": "https://schema.org", "@type": "LocalBusiness" };
  if (profile.name) out.name = profile.name;
  if (profile.shortDescription || profile.longDescription) out.description = profile.longDescription || profile.shortDescription;
  if (profile.website) out.url = profile.website;
  if (profile.phone) out.telephone = profile.phone;
  if (profile.email) out.email = profile.email;
  if (profile.address || profile.postalCode) {
    const addr: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: "JP" };
    if (profile.postalCode) addr.postalCode = profile.postalCode;
    if (profile.address) addr.streetAddress = profile.address;
    out.address = addr;
  }
  // schema.org では 24 時間営業を 00:00〜23:59 と書く（24:00 は Google の書き方）
  const specs = parseHoursText(profile.hours).specs.map((x) => (x.closes === "24:00" ? { ...x, closes: "23:59" } : x));
  if (specs.length > 0) out.openingHoursSpecification = specs;
  return out;
}

export function jsonLdScript(profile: ListingProfile): string {
  // </script> でタグを閉じられないようエスケープ
  return `<script type="application/ld+json">\n${JSON.stringify(toJsonLd(profile), null, 2).replace(/<\//g, "<\\/")}\n</script>`;
}
