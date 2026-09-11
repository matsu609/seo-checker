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
