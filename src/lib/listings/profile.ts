/**
 * 基本情報掲載の「正」となる店舗の基本情報（NAP: Name / Address / Phone + サイト・営業時間・説明文）と、
 * 媒体ごとの掲載状況。クライアントでも読める純粋な型と関数。
 *
 * すべての媒体にここと同じ内容を載せる（表記ゆれが無いことが、地図・検索・生成 AI に正しく認識される条件）。
 */
import { z } from "zod";
import type { PlaceDetail } from "@/lib/maps/types";
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

/** 基本情報と Google マップの公開情報のずれ（どちらかが空なら比べない） */
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
    const a = normalizeForCompare(p.a);
    const b = normalizeForCompare(p.b);
    // 住所は Google が「日本、〒…」を付けるので、片方がもう片方を含んでいれば同じと見なす
    if (a === b || (p.field === "address" && (a.includes(b) || b.includes(a)))) continue;
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

/**
 * 「月曜日: 10時00分～19時00分」「Mon: 10:00 – 19:00」のような 1 行 → schema.org の形。
 * 定休日・読めない行は飛ばす（純粋関数）。
 */
export function parseHoursLine(line: string): OpeningHoursSpec | null {
  const t = line.normalize("NFKC").trim();
  const dayMatch = /^([月火水木金土日])曜?日?|^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i.exec(t);
  if (!dayMatch) return null;
  const day = DAY_CODES[(dayMatch[1] ?? dayMatch[2] ?? "").toLowerCase()];
  if (!day) return null;
  const rest = t.slice(dayMatch[0].length);
  if (/定休|休業|休み|closed/i.test(rest)) return null;
  const re = /(\d{1,2})(?:[:時](\d{2})?分?)?\s*(am|pm)?\s*[~〜～\-–—]\s*(\d{1,2})(?:[:時](\d{2})?分?)?\s*(am|pm)?/i;
  const mm = re.exec(rest);
  if (!mm) return null;
  const opens = toHHMM(mm[1]!, mm[2], mm[3]);
  const closes = toHHMM(mm[4]!, mm[5], mm[6]);
  if (!opens || !closes) return null;
  return { "@type": "OpeningHoursSpecification", dayOfWeek: day, opens, closes };
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
  const specs = profile.hours
    .split(/\r?\n/)
    .map(parseHoursLine)
    .filter((x): x is OpeningHoursSpec => x !== null);
  if (specs.length > 0) out.openingHoursSpecification = specs;
  return out;
}

export function jsonLdScript(profile: ListingProfile): string {
  // </script> でタグを閉じられないようエスケープ
  return `<script type="application/ld+json">\n${JSON.stringify(toJsonLd(profile), null, 2).replace(/<\//g, "<\\/")}\n</script>`;
}
