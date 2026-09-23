/**
 * Google Business Profile API（口コミの取得と返信）。サーバー専用。
 *
 * 3 つの API を使う（どれも Google Cloud で有効化と、Business Profile API の利用申請の承認が要る）:
 *   - Account Management v1 … 自分が管理するアカウント（accounts/123）
 *   - Business Information v1 … アカウント配下のビジネス（locations/456。Place ID も返る）
 *   - My Business v4 … 口コミの一覧と返信（accounts/123/locations/456/reviews/…）
 *
 * アクセストークンはログイン中のユーザーのもの（token.ts、スコープ business.manage）。
 * エンドポイントは固定（ユーザー入力の URL ではない）。応答は落ちない純関数（parse*）で読む。
 */
import { GoogleLinkError, mapGoogleHttpError } from "./errors";
import { getGoogleTokenFor } from "./token";

export const ACCOUNT_ENDPOINT = "https://mybusinessaccountmanagement.googleapis.com/v1";
export const INFORMATION_ENDPOINT = "https://mybusinessbusinessinformation.googleapis.com/v1";
export const REVIEWS_ENDPOINT = "https://mybusiness.googleapis.com/v4";
const TIMEOUT_MS = 30_000;
const LABEL = "Google ビジネス プロフィール";

/** 1 回で取る口コミの件数（Google の上限は 50） */
export const REVIEWS_PAGE_SIZE = 50;
export { REPLY_MAX } from "@/lib/replies/constants";

export interface BpAccount {
  /** "accounts/123" */
  name: string;
  accountName: string;
  type: string;
}

export interface BpLocation {
  /** "accounts/123/locations/456"（口コミ API で使う形に揃える） */
  name: string;
  title: string;
  address: string;
  /** Google マップの Place ID（MEO の登録店舗と突き合わせる） */
  placeId: string | null;
  accountName: string;
}

export interface BpReview {
  /** "accounts/123/locations/456/reviews/abc"（返信の投稿に使う） */
  name: string;
  reviewId: string;
  reviewer: string;
  anonymous: boolean;
  /** 1〜5。無ければ null */
  rating: number | null;
  comment: string;
  createdAt: string | null;
  updatedAt: string | null;
  reply: { comment: string; updatedAt: string | null } | null;
}

export interface BpReviewsPage {
  reviews: BpReview[];
  nextPageToken: string | null;
  averageRating: number | null;
  totalReviewCount: number | null;
}

export interface BusinessProfileOptions {
  accountEndpoint?: string;
  informationEndpoint?: string;
  reviewsEndpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** テスト用。省略時は Clerk からユーザーのトークンを取る */
  getToken?: () => Promise<string>;
}

const LOCATION_NAME = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/;
const REVIEW_NAME = /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/;

export function isLocationName(value: string): boolean {
  return LOCATION_NAME.test(value);
}
export function isReviewName(value: string): boolean {
  return REVIEW_NAME.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** "FIVE" → 5。知らない値は null */
export function starToNumber(value: unknown): number | null {
  return typeof value === "string" && value in STARS ? STARS[value]! : null;
}

export function parseAccounts(payload: unknown): BpAccount[] {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.accounts) ? root.accounts : [];
  const out: BpAccount[] = [];
  for (const a of list) {
    if (!isRecord(a)) continue;
    const name = str(a.name);
    if (!/^accounts\/[A-Za-z0-9_-]+$/.test(name)) continue;
    out.push({ name, accountName: str(a.accountName) || name, type: str(a.type) });
  }
  return out;
}

/** locations の応答 → 一覧。name は "accounts/…/locations/…" に揃える */
export function parseLocations(payload: unknown, accountName: string): BpLocation[] {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.locations) ? root.locations : [];
  const out: BpLocation[] = [];
  for (const l of list) {
    if (!isRecord(l)) continue;
    const raw = str(l.name);
    const id = raw.split("/").pop() ?? "";
    if (!raw.startsWith("locations/") || !id) continue;
    const addr = isRecord(l.storefrontAddress) ? l.storefrontAddress : {};
    const lines = Array.isArray(addr.addressLines) ? addr.addressLines.filter((x): x is string => typeof x === "string") : [];
    const address = [str(addr.administrativeArea), str(addr.locality), ...lines].filter(Boolean).join(" ");
    const meta = isRecord(l.metadata) ? l.metadata : {};
    out.push({
      name: `${accountName}/locations/${id}`,
      title: str(l.title) || id,
      address,
      placeId: strOrNull(meta.placeId),
      accountName,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export function parseReview(value: unknown): BpReview | null {
  if (!isRecord(value)) return null;
  const name = str(value.name);
  if (!isReviewName(name)) return null;
  const reviewer = isRecord(value.reviewer) ? value.reviewer : {};
  const reply = isRecord(value.reviewReply) ? value.reviewReply : null;
  return {
    name,
    reviewId: str(value.reviewId) || (name.split("/").pop() ?? ""),
    reviewer: str(reviewer.displayName) || "Google ユーザー",
    anonymous: reviewer.isAnonymous === true,
    rating: starToNumber(value.starRating),
    comment: str(value.comment),
    createdAt: strOrNull(value.createTime),
    updatedAt: strOrNull(value.updateTime),
    reply: reply && str(reply.comment) ? { comment: str(reply.comment), updatedAt: strOrNull(reply.updateTime) } : null,
  };
}

export function parseReviews(payload: unknown): BpReviewsPage {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.reviews) ? root.reviews : [];
  const reviews = list.map(parseReview).filter((r): r is BpReview => r !== null);
  const avg = typeof root.averageRating === "number" ? root.averageRating : null;
  const total = typeof root.totalReviewCount === "number" ? root.totalReviewCount : null;
  return { reviews, nextPageToken: strOrNull(root.nextPageToken), averageRating: avg, totalReviewCount: total };
}

/** 403 は「権限」だけでなく「API 未有効 / 利用申請が未承認」のことが多いので、案内を変える */
function mapError(status: number): GoogleLinkError {
  if (status === 403) {
    return new GoogleLinkError(
      `${LABEL}にアクセスできませんでした。Business Profile API の利用申請が承認され、Google Cloud で 3 つの API（Account Management / Business Information / My Business v4）が有効になっているか、接続した Google アカウントがそのビジネスの管理者かをご確認ください。`,
      "forbidden",
    );
  }
  if (status === 404) {
    return new GoogleLinkError(`${LABEL}に該当するビジネスや口コミが見つかりませんでした。`, "forbidden");
  }
  return mapGoogleHttpError(status, LABEL);
}

async function callApi(url: string, init: RequestInit, options: BusinessProfileOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => getGoogleTokenFor("business-profile"));
  const token = await getToken();
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new GoogleLinkError(timedOut ? `${LABEL}の応答がありませんでした（タイムアウト）` : `${LABEL}に接続できませんでした`, "network");
  }
  if (!res.ok) throw mapError(res.status);
  if (res.status === 204) return {};
  try {
    return await res.json();
  } catch {
    throw new GoogleLinkError(`${LABEL}の応答を解釈できませんでした`, "network");
  }
}

export async function listAccounts(options: BusinessProfileOptions = {}): Promise<BpAccount[]> {
  const base = options.accountEndpoint ?? ACCOUNT_ENDPOINT;
  return parseAccounts(await callApi(`${base}/accounts?pageSize=20`, { method: "GET" }, options));
}

export async function listLocations(accountName: string, options: BusinessProfileOptions = {}): Promise<BpLocation[]> {
  const base = options.informationEndpoint ?? INFORMATION_ENDPOINT;
  const readMask = encodeURIComponent("name,title,storefrontAddress,metadata");
  const payload = await callApi(`${base}/${accountName}/locations?readMask=${readMask}&pageSize=100`, { method: "GET" }, options);
  return parseLocations(payload, accountName);
}

/** 管理しているすべてのアカウントのビジネスを 1 つの一覧に（アカウントは最大 20） */
export async function listAllLocations(options: BusinessProfileOptions = {}): Promise<BpLocation[]> {
  const accounts = await listAccounts(options);
  const all: BpLocation[] = [];
  for (const a of accounts) all.push(...(await listLocations(a.name, options)));
  return all;
}

export async function listReviews(locationName: string, pageToken: string | null = null, options: BusinessProfileOptions = {}): Promise<BpReviewsPage> {
  if (!isLocationName(locationName)) throw new GoogleLinkError("ビジネスの指定が正しくありません。", "not_selected");
  const base = options.reviewsEndpoint ?? REVIEWS_ENDPOINT;
  const params = new URLSearchParams({ pageSize: String(REVIEWS_PAGE_SIZE), orderBy: "updateTime desc" });
  if (pageToken) params.set("pageToken", pageToken);
  return parseReviews(await callApi(`${base}/${locationName}/reviews?${params.toString()}`, { method: "GET" }, options));
}

/** 返信を投稿する（既に返信があれば上書き）。返ってきた返信を返す */
export async function replyToReview(reviewName: string, comment: string, options: BusinessProfileOptions = {}): Promise<{ comment: string; updatedAt: string | null }> {
  if (!isReviewName(reviewName)) throw new GoogleLinkError("口コミの指定が正しくありません。", "not_selected");
  const base = options.reviewsEndpoint ?? REVIEWS_ENDPOINT;
  const payload = await callApi(
    `${base}/${reviewName}/reply`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment }) },
    options,
  );
  const root = isRecord(payload) ? payload : {};
  return { comment: str(root.comment) || comment, updatedAt: strOrNull(root.updateTime) };
}

export async function deleteReply(reviewName: string, options: BusinessProfileOptions = {}): Promise<void> {
  if (!isReviewName(reviewName)) throw new GoogleLinkError("口コミの指定が正しくありません。", "not_selected");
  const base = options.reviewsEndpoint ?? REVIEWS_ENDPOINT;
  await callApi(`${base}/${reviewName}/reply`, { method: "DELETE" }, options);
}

/* ───────────── 基本情報（NAP）の更新 ───────────── */

/**
 * 掲載（サイテーション）の「一括登録」で Google に送る内容。
 *
 * 住所は送らない（更新マスクに入れない）。日本語の住所 1 行を Google の構造化住所
 * （administrativeArea / locality / addressLines）に機械的に割るのは危うく、
 * 住所を書き換えると再審査（はがき）になって掲載が止まることがあるため。
 * 住所は表記ゆれの確認で気付いてもらい、ビジネス プロフィールで直してもらう。
 */
export interface NapUpdate {
  title: string;
  phone: string;
  website: string;
  description: string;
  hours: readonly { dayOfWeek: string; opens: string; closes: string }[];
}

const DAY_ENUM: Record<string, string> = {
  Monday: "MONDAY", Tuesday: "TUESDAY", Wednesday: "WEDNESDAY", Thursday: "THURSDAY",
  Friday: "FRIDAY", Saturday: "SATURDAY", Sunday: "SUNDAY",
};

/** "10:30" → { hours: 10, minutes: 30 }。読めなければ null */
export function toTimeOfDay(value: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 24 || minutes > 59) return null;
  return { hours, minutes };
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

interface TimePeriod {
  openDay: string;
  openTime: { hours: number; minutes: number };
  closeDay: string;
  closeTime: { hours: number; minutes: number };
}

/**
 * 1 つの時間帯 → Business Information API の TimePeriod。読めなければ null。
 * - 閉店が開店より前（18:00〜2:00）は深夜をまたぐので閉店日を翌日にする
 *   （同じ曜日のままだと「閉店が開店より前」で Google が 400 を返し、店名・電話を含む更新全体が落ちる）
 * - 0:00 閉店は「その日の 24:00」と書く（API の約束。24:00 はその日の終わり）
 */
export function toTimePeriod(h: { dayOfWeek: string; opens: string; closes: string }): TimePeriod | null {
  const openDay = DAY_ENUM[h.dayOfWeek];
  const openTime = toTimeOfDay(h.opens);
  let closeTime = toTimeOfDay(h.closes);
  if (!openDay || !openTime || !closeTime || openTime.hours >= 24) return null;
  const open = openTime.hours * 60 + openTime.minutes;
  if (closeTime.hours === 0 && closeTime.minutes === 0 && open > 0) closeTime = { hours: 24, minutes: 0 };
  const close = closeTime.hours * 60 + closeTime.minutes;
  if (close === open) return null;
  const closeDay = close > open ? openDay : DAY_ORDER[(DAY_ORDER.indexOf(openDay as (typeof DAY_ORDER)[number]) + 1) % 7]!;
  return { openDay, openTime, closeDay, closeTime };
}

/**
 * 送る本文と updateMask を組み立てる（純粋関数）。
 * 空の項目はマスクに入れない = 消さない（Google 側にある値を空で上書きしないため）。
 */
export function toLocationPatch(nap: NapUpdate): { body: Record<string, unknown>; updateMask: string } {
  const body: Record<string, unknown> = {};
  const mask: string[] = [];
  if (nap.title.trim()) {
    body.title = nap.title.trim();
    mask.push("title");
  }
  if (nap.phone.trim()) {
    body.phoneNumbers = { primaryPhone: nap.phone.trim() };
    mask.push("phoneNumbers");
  }
  if (nap.website.trim()) {
    body.websiteUri = nap.website.trim();
    mask.push("websiteUri");
  }
  if (nap.description.trim()) {
    body.profile = { description: nap.description.trim() };
    mask.push("profile");
  }
  const periods = nap.hours.map(toTimePeriod);
  // 1 つでも読めない時間帯があれば営業時間は送らない（regularHours は丸ごと置き換えなので、
  // 欠けた曜日・時間帯が Google 側で「休業」になる）
  if (periods.length > 0 && periods.every((p) => p !== null)) {
    body.regularHours = { periods };
    mask.push("regularHours");
  }
  return { body, updateMask: mask.join(",") };
}

/** "accounts/123/locations/456" → "locations/456"（Business Information v1 のリソース名） */
export function toInformationName(locationName: string): string {
  const id = locationName.split("/").pop() ?? "";
  return `locations/${id}`;
}

/**
 * ビジネスの基本情報を更新する。送るものが無ければ false を返す（呼び出しを起こさない）。
 * 承認前・権限なしは mapError() が 403 の案内に変える。
 */
export async function updateLocationNap(locationName: string, nap: NapUpdate, options: BusinessProfileOptions = {}): Promise<boolean> {
  if (!isLocationName(locationName)) throw new GoogleLinkError("ビジネスの指定が正しくありません。", "not_selected");
  const { body, updateMask } = toLocationPatch(nap);
  if (!updateMask) return false;
  const base = options.informationEndpoint ?? INFORMATION_ENDPOINT;
  await callApi(
    `${base}/${toInformationName(locationName)}?updateMask=${encodeURIComponent(updateMask)}`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    options,
  );
  return true;
}

/* ───────────── 投稿（Local Posts。r127） ───────────── */

export interface LocalPostInput {
  topicType: "STANDARD" | "EVENT" | "OFFER";
  summary: string;
  title?: string;
  ctaType?: string;
  ctaUrl?: string;
  /** YYYY-MM-DD */
  eventStart?: string | null;
  eventEnd?: string | null;
}

function toGoogleDate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 送る本文（純粋関数）。イベント・クーポンは題名と期間、ボタンは種類と URL */
export function toLocalPostBody(post: LocalPostInput): Record<string, unknown> {
  const body: Record<string, unknown> = { languageCode: "ja", summary: post.summary.trim(), topicType: post.topicType };
  if (post.topicType !== "STANDARD") {
    const start = post.eventStart ? toGoogleDate(post.eventStart) : null;
    const end = post.eventEnd ? toGoogleDate(post.eventEnd) : null;
    body.event = { title: (post.title ?? "").trim(), schedule: { ...(start ? { startDate: start } : {}), ...(end ? { endDate: end } : {}) } };
  }
  if (post.ctaType && post.ctaType !== "NONE") {
    body.callToAction = post.ctaType === "CALL" ? { actionType: "CALL" } : { actionType: post.ctaType, url: (post.ctaUrl ?? "").trim() };
  }
  return body;
}

/** 投稿を作る。返ってきた投稿の名前（accounts/…/localPosts/…）と検索用 URL */
export async function createLocalPost(locationName: string, post: LocalPostInput, options: BusinessProfileOptions = {}): Promise<{ name: string | null; searchUrl: string | null }> {
  if (!isLocationName(locationName)) throw new GoogleLinkError("ビジネスの指定が正しくありません。", "not_selected");
  const base = options.reviewsEndpoint ?? REVIEWS_ENDPOINT;
  const payload = await callApi(
    `${base}/${locationName}/localPosts`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toLocalPostBody(post)) },
    options,
  );
  const root = isRecord(payload) ? payload : {};
  return { name: strOrNull(root.name), searchUrl: strOrNull(root.searchUrl) };
}
