/**
 * 登記（国税庁）の商号・本店所在地と、掲載の「基本情報（正）」の突き合わせ。純粋関数だけ。
 *
 * 掲載タブはこれまで Google マップの公開情報とだけ比べていた（compareNap）。
 * 登記は**国の一次情報**なので、こちらのほうが「正しい表記」の根拠として強い。
 * 比較の正規化は掲載と同じ normalizeForCompare を使う（判定基準を 2 つ持たない）。
 *
 * 住所は**一致しないのが普通**であることに注意する。登記は「本店所在地」で、
 * 掲載の住所は「店舗の所在地」。支店・店舗型のビジネスでは違って当たり前なので、
 * 食い違いを「間違い」と言い切らず、「登記と違う」とだけ出す。
 */
import { normalizeForCompare, type ListingProfile } from "@/lib/listings/profile";
import type { Corporation } from "./parse";

export type RegistryField = "name" | "address";
export type RegistryStatus =
  /** 登記と同じ */
  | "match"
  /** 登記と違う（住所は本店 ≠ 店舗のことがあるので、これだけでは間違いと言えない） */
  | "differs"
  /** どちらかが空で比べられない */
  | "unknown";

export interface RegistryFinding {
  field: RegistryField;
  label: string;
  status: RegistryStatus;
  /** 掲載の基本情報（正）の値 */
  profile: string;
  /** 登記の値 */
  registry: string;
  /** 画面にそのまま出す 1 文 */
  message: string;
}

const NAME_MESSAGES: Record<RegistryStatus, string> = {
  match: "登記上の商号と一致しています。",
  differs: "登記上の商号と違います。店舗名として使っている通称であれば問題ありません（登記の商号は構造化データの legalName に使えます）。",
  unknown: "どちらかが空のため比べられません。",
};

const ADDRESS_MESSAGES: Record<RegistryStatus, string> = {
  match: "登記上の本店所在地と一致しています。",
  differs: "登記上の本店所在地と違います。店舗が本店と別の場所にあるなら正常です。同じはずなら、どちらかの表記を直してください。",
  unknown: "どちらかが空のため比べられません。",
};

function judge(a: string, b: string): RegistryStatus {
  if (!a.trim() || !b.trim()) return "unknown";
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  // 住所は「東京都新宿区新宿1-1-1」と「新宿区新宿1-1-1 ○○ビル 2F」のように
  // 片方がもう片方を含むことが多い。含んでいれば同じと見なす（掲載の compareNap と同じ考え方）
  return x === y || x.includes(y) || y.includes(x) ? "match" : "differs";
}

export function compareWithRegistry(profile: ListingProfile, corporation: Corporation): RegistryFinding[] {
  const nameStatus = judge(profile.name, corporation.name);
  const addressStatus = judge(profile.address, corporation.address);
  return [
    { field: "name", label: "商号", status: nameStatus, profile: profile.name, registry: corporation.name, message: NAME_MESSAGES[nameStatus] },
    { field: "address", label: "所在地", status: addressStatus, profile: profile.address, registry: corporation.address, message: ADDRESS_MESSAGES[addressStatus] },
  ];
}

/** 掲載の基本情報に取り込める値（空欄だけを埋める。入っている値は上書きしない） */
export function prefillFromRegistry(profile: ListingProfile, corporation: Corporation): ListingProfile {
  const next: ListingProfile = {
    ...profile,
    name: profile.name || corporation.name,
    nameKana: profile.nameKana || corporation.furigana,
    postalCode: profile.postalCode || corporation.postCode,
    address: profile.address || corporation.address,
    // 登記上の商号は必ず控える（店名が通称のとき、構造化データの legalName に出す）
    legalName: corporation.name,
  };
  return next.name === profile.name &&
    next.nameKana === profile.nameKana &&
    next.postalCode === profile.postalCode &&
    next.address === profile.address &&
    next.legalName === profile.legalName
    ? profile
    : next;
}
