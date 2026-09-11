/**
 * Google ビジネス プロフィールの充実度を採点する。純粋関数（生成 AI 不使用）。
 *
 * 項目は MEO ツールで一般的な 4 カテゴリ（基本情報 / 投稿 / 写真 / レビュー）に分ける。
 * Places API では取れない 9 項目（説明文・開業日・メニュー・投稿・写真の日付・ロゴ/カバー・返信）は、
 * オーナー申告（src/lib/maps/owner-input.ts）があればそれで採点し、無ければ "unavailable" として
 * 一覧には出すが採点からは外す。「測れなかった」を 0 点にしない（無料診断と同じ方針）。
 * Business Profile API の連携が入れば、申告の代わりに API の値を同じ形で流し込めばよい。
 *
 * 重みの合計は 100（全項目が測れたとき）。pass = 満点、warn = 半分、fail = 0。
 * スコアは「測れた項目の重み」に対する獲得率なので、未取得が多くても比較できる。
 */
import { gradeOf, type GradeInfo } from "@/lib/ui/grade";
import {
  DESCRIPTION_GOOD,
  descriptionHasForbidden,
  foundKeywords,
  PHOTO_FRESH_DAYS,
  PHOTO_STALE_DAYS,
  POSTS_GOOD,
  REPLY_RATE_GOOD,
  REPLY_RATE_SOME,
  type MeoOwnerData,
} from "./owner-input";
import type { PlaceDetail } from "./types";

export type CheckStatus = "pass" | "warn" | "fail" | "unavailable";
export type CategoryId = "basics" | "posts" | "photos" | "reviews";
/**
 * データの出どころ。
 * places = Google マップの公開情報、owner = オーナー申告、
 * profile = Business Profile API（オーナー権限）が要るのにまだ無い（= unavailable）
 */
export type CheckSource = "places" | "owner" | "profile";

export const CATEGORY_ORDER: readonly CategoryId[] = ["basics", "posts", "photos", "reviews"];
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  basics: "基本情報",
  posts: "投稿",
  photos: "写真",
  reviews: "レビュー",
};

export interface ProfileCheck {
  id: string;
  category: CategoryId;
  label: string;
  /** 何を見ているか（例:「営業時間が設定されているか」） */
  question: string;
  status: CheckStatus;
  weight: number;
  /** 測定値・理由 */
  detail: string;
  /** 改善のヒント（pass / unavailable のときは省略） */
  advice?: string;
  source: CheckSource;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  /** 測れた項目が無ければ null */
  score: number | null;
  grade: GradeInfo | null;
  /** 測れた項目数 / 全項目数 */
  measured: number;
  total: number;
  checks: ProfileCheck[];
}

export interface ProfileScore {
  /** 有料の 28 項目版なら true（r28 より前の保存分には無い） */
  extended?: boolean;
  score: number | null;
  grade: GradeInfo | null;
  /** 測れた重み / 全重み（表示用。「62 / 100 点分を測定」） */
  measuredWeight: number;
  totalWeight: number;
  categories: CategoryScore[];
  checks: ProfileCheck[];
}

/* ───────────── しきい値 ───────────── */

export const PHOTO_GOOD = 10;
export const REVIEW_GOOD = 100;
export const REVIEW_SOME = 30;
export const RATING_GOOD = 4.4;
export const RATING_OK = 4.0;
/** 直近の口コミがこの日数以内なら活発とみなす */
export const RECENT_DAYS = 90;
export const STALE_DAYS = 365;
/** これより長いビジネス名はキーワードの詰め込みを疑う */
export const NAME_MAX_CHARS = 30;

const FACTOR: Record<Exclude<CheckStatus, "unavailable">, number> = { pass: 1, warn: 0.5, fail: 0 };

export interface ScoreOptions {
  /**
   * true（既定）= 有料の診断: r28 で足した Google 取得の 7 項目（追加カテゴリ・属性・オーナー写真・
   * 写真の品質・口コミ内のキーワード・口コミ本文・Google の警告）を含む 28 項目。
   * false = 無料診断: r27 までの 21 項目。どちらも重みの合計は 100。
   */
  extended?: boolean;
}

/** 項目ごとの配点（extended = 有料 28 項目 / base = 無料 21 項目）。どちらも合計 100 */
export const WEIGHTS = {
  base: {
    status: 4, name: 4, category: 5, description: 4, openingDate: 1, address: 3, hours: 5, hoursAccuracy: 3, menu: 3, website: 4, phone: 4,
    postFrequency: 6, postKeywords: 4,
    photos: 7, photoFreshness: 4, logoCover: 4,
    rating: 10, reviewCount: 10, reviewReply: 6, replyRate: 6, recent: 3,
  },
  extended: {
    status: 3, name: 3, category: 4, extraCategories: 2, description: 4, openingDate: 1, address: 2, hours: 4, hoursAccuracy: 3, menu: 3, website: 4, phone: 4, attributes: 3,
    postFrequency: 6, postKeywords: 4,
    photos: 6, ownerPhotos: 3, photoQuality: 2, photoFreshness: 2, logoCover: 3,
    rating: 9, reviewCount: 8, reviewReply: 5, replyRate: 5, recent: 2, reviewKeywords: 2, reviewText: 1, consumerAlert: 2,
  },
} as const;

/** 属性がこの数以上あれば十分 */
export const ATTRIBUTES_GOOD = 5;
/** Google が返す最大 10 枚のうち、オーナー投稿がこの枚数以上あれば合格 */
export const OWNER_PHOTOS_GOOD = 3;
/** 長辺がこれ未満の写真は低解像度とみなす */
export const PHOTO_MIN_PX = 1024;
/** 口コミ本文が「書かれている」とみなす文字数と、その割合 */
export const REVIEW_TEXT_MIN_CHARS = 20;
export const REVIEW_TEXT_GOOD_RATIO = 0.6;

const UNAVAILABLE_DETAIL = "Google マップの公開情報では取れない項目です（オーナーの入力があれば採点に入ります）";

/* ───────────── 小さな道具 ───────────── */

function daysBetween(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** 最新の口コミが何日前か。無ければ null */
export function latestReviewAgeDays(place: PlaceDetail, now = new Date()): number | null {
  let best: number | null = null;
  for (const r of place.reviews) {
    if (!r.publishedAt) continue;
    const d = daysBetween(r.publishedAt, now);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

/** ビジネス名にキーワードや装飾を詰め込んでいそうか（Google のガイドライン違反になりやすい） */
export function looksKeywordStuffed(name: string): boolean {
  if (name.length > NAME_MAX_CHARS) return true;
  return /[|｜【】★☆]|格安|最安|No\.?\s?1|口コミ\s?[1１]位/i.test(name);
}

/** 曜日ごとの営業時間が 7 日分あり、すべて定休日ではないか */
export function hoursLookComplete(hours: readonly string[]): "complete" | "partial" | "none" {
  if (hours.length === 0) return "none";
  const closed = hours.filter((h) => /定休日|休業|Closed/i.test(h)).length;
  if (hours.length >= 7 && closed < hours.length) return "complete";
  return "partial";
}

type Judged = Pick<ProfileCheck, "status" | "detail" | "advice">;

function check(
  base: Omit<ProfileCheck, "status" | "detail" | "advice" | "source"> & { source?: CheckSource },
  judged: Judged,
): ProfileCheck {
  return { source: "places", ...base, ...judged };
}

function unavailable(base: Omit<ProfileCheck, "status" | "detail" | "advice" | "source">): ProfileCheck {
  return { ...base, source: "profile", status: "unavailable", detail: UNAVAILABLE_DETAIL };
}

/** r28 で足した項目が、古い保存分（取得前）で無いとき */
function notFetched(base: Omit<ProfileCheck, "status" | "detail" | "advice" | "source">): ProfileCheck {
  return { ...base, source: "places", status: "unavailable", detail: "この項目は次回の一斉更新から取得します（r28 で追加）" };
}

function sameName(a: string, b: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[\s　]+/g, "");
  return n(a) === n(b);
}

/** オーナー申告で埋める項目。judged が null なら未回答 = unavailable */
function fromOwner(base: Omit<ProfileCheck, "status" | "detail" | "advice" | "source">, judged: Judged | null): ProfileCheck {
  if (!judged) return unavailable(base);
  return { ...base, source: "owner", ...judged };
}

/** 日付（YYYY-MM-DD）が何日前か。読めなければ null */
function daysSince(date: string, now: Date): number | null {
  return daysBetween(`${date}T00:00:00Z`, now);
}

/* ───────────── オーナー申告の判定（純粋関数。null = 未回答） ───────────── */

export function judgeDescription(owner: MeoOwnerData | null | undefined): Judged | null {
  const text = owner?.input.description;
  if (text === null || text === undefined) return null;
  const body = text.trim();
  if (!body) return { status: "fail", detail: "説明文を設定していません", advice: "業種・地域・強み・対策キーワードを入れた説明文（750 文字まで）を設定してください" };
  if (descriptionHasForbidden(body)) {
    return { status: "warn", detail: `${body.length} 文字（URL または HTML を含む）`, advice: "説明文に URL や HTML タグは使えません（ガイドライン違反）。文章だけにしてください" };
  }
  const keywords = owner?.input.keywords ?? [];
  const hit = foundKeywords(body, keywords);
  if (body.length < DESCRIPTION_GOOD) {
    return { status: "warn", detail: `${body.length} 文字`, advice: `${DESCRIPTION_GOOD} 文字以上を目安に、提供するサービス・地域・強みを具体的に書いてください` };
  }
  if (keywords.length > 0 && hit.length === 0) {
    return { status: "warn", detail: `${body.length} 文字（対策キーワードを含まない）`, advice: `対策キーワード（${keywords.join("、")}）のいずれかを自然な文章で入れてください` };
  }
  return { status: "pass", detail: `${body.length} 文字${hit.length > 0 ? `（キーワード: ${hit.join("、")}）` : ""}` };
}

export function judgeOpeningDate(owner: MeoOwnerData | null | undefined): Judged | null {
  const v = owner?.input.openingDate;
  if (v === null || v === undefined) return null;
  return v
    ? { status: "pass", detail: "開業日を設定しています" }
    : { status: "fail", detail: "開業日を設定していません", advice: "プロフィールの「開業日」を設定すると、営業年数が伝わり信頼につながります" };
}

export function judgeMenu(owner: MeoOwnerData | null | undefined): Judged | null {
  const v = owner?.input.menu;
  if (v === null || v === undefined) return null;
  return v
    ? { status: "pass", detail: "メニューまたはサービスを設定しています" }
    : { status: "fail", detail: "メニュー・サービスを設定していません", advice: "商品・メニュー・サービスを価格つきで登録すると、検索面の表示が増えます" };
}

export function judgePostFrequency(owner: MeoOwnerData | null | undefined): Judged | null {
  const n = owner?.input.postsLast4Weeks;
  if (n === null || n === undefined) return null;
  if (n >= POSTS_GOOD) return { status: "pass", detail: `直近 4 週間に ${n} 件（週 1 件以上）` };
  if (n > 0) return { status: "warn", detail: `直近 4 週間に ${n} 件`, advice: "週 1 件以上を目安に、最新情報・イベント・特典を投稿してください" };
  return { status: "fail", detail: "直近 4 週間に投稿がありません", advice: "投稿が止まると活動していない印象になります。週 1 件を目安に再開してください" };
}

export function judgePostKeywords(owner: MeoOwnerData | null | undefined): Judged | null {
  if (!owner) return null;
  const { postsLast4Weeks, latestPostText, keywords } = owner.input;
  if (postsLast4Weeks === 0) return { status: "fail", detail: "投稿が無いため、キーワードも入っていません", advice: "投稿を再開し、本文に対策キーワードを自然に含めてください" };
  if (latestPostText === null) return null;
  const body = latestPostText.trim();
  if (!body) return { status: "fail", detail: "最新の投稿に本文がありません", advice: "写真だけでなく、対策キーワードを含む本文を添えてください" };
  if (keywords.length === 0) return { status: "warn", detail: `${body.length} 文字（対策キーワードが未設定のため判定できません）`, advice: "「対策キーワード」を入力すると、投稿にキーワードが入っているか判定します" };
  const hit = foundKeywords(body, keywords);
  return hit.length > 0
    ? { status: "pass", detail: `キーワードを含む: ${hit.join("、")}` }
    : { status: "fail", detail: `対策キーワード（${keywords.join("、")}）を含んでいません`, advice: "投稿の本文に地域名・業種などの対策キーワードを自然に入れてください" };
}

export function judgePhotoFreshness(owner: MeoOwnerData | null | undefined, now: Date): Judged | null {
  const date = owner?.input.ownerPhotoLastAt;
  if (date === null || date === undefined) return null;
  const days = daysSince(date, now);
  if (days === null) return { status: "warn", detail: "日付を読めませんでした" };
  if (days <= PHOTO_FRESH_DAYS) return { status: "pass", detail: `オーナーの最新写真は ${Math.max(days, 0)} 日前` };
  if (days <= PHOTO_STALE_DAYS) return { status: "warn", detail: `オーナーの最新写真は ${days} 日前`, advice: "月 1 回以上、新しい写真（商品・季節・スタッフ）を追加してください" };
  return { status: "fail", detail: `オーナーの最新写真は ${days} 日前`, advice: "写真の更新が止まっています。月 1 回以上を目安に追加してください" };
}

export function judgeLogoCover(owner: MeoOwnerData | null | undefined): Judged | null {
  const logo = owner?.input.logo;
  const cover = owner?.input.cover;
  if ((logo === null || logo === undefined) && (cover === null || cover === undefined)) return null;
  const hasLogo = logo === true;
  const hasCover = cover === true;
  if (hasLogo && hasCover) return { status: "pass", detail: "ロゴとカバー写真を設定しています" };
  if (hasLogo || hasCover) {
    return { status: "warn", detail: hasLogo ? "ロゴのみ（カバー写真が未設定）" : "カバー写真のみ（ロゴが未設定）", advice: "ロゴとカバー写真の両方を設定すると、検索面で店舗を識別しやすくなります" };
  }
  return { status: "fail", detail: "ロゴ・カバー写真を設定していません", advice: "ロゴ（正方形）とカバー写真（横長）を設定してください" };
}

export function judgeReplyRate(owner: MeoOwnerData | null | undefined, ratingCount: number | null): Judged | null {
  const replied = owner?.input.repliedReviews;
  if (replied === null || replied === undefined) return null;
  if (ratingCount === null) return { status: "warn", detail: `返信 ${replied} 件（口コミの総数を取得できず、返信率を出せません）` };
  if (ratingCount === 0) return { status: "warn", detail: "口コミがまだありません" };
  const rate = Math.min(replied / ratingCount, 1);
  const pct = Math.round(rate * 100);
  if (rate >= REPLY_RATE_GOOD) return { status: "pass", detail: `返信率 ${pct}%（${Math.min(replied, ratingCount)} / ${ratingCount} 件）` };
  if (rate >= REPLY_RATE_SOME) return { status: "warn", detail: `返信率 ${pct}%（${replied} / ${ratingCount} 件）`, advice: "すべての口コミに返信し、返信率 90% 以上を目指してください" };
  return { status: "fail", detail: `返信率 ${pct}%（${replied} / ${ratingCount} 件）`, advice: "返信が少ないと放置している印象になります。低評価から順に、すべての口コミに返信してください" };
}

export function judgeReviewReply(owner: MeoOwnerData | null | undefined, placeName: string): Judged | null {
  if (!owner) return null;
  const { repliedReviews, replyText, keywords } = owner.input;
  if (repliedReviews === 0) return { status: "fail", detail: "返信が無いため、ブランドキーワードも入っていません", advice: "返信文に店舗名や地域名を入れて返信してください" };
  if (replyText === null) return null;
  const body = replyText.trim();
  if (!body) return { status: "fail", detail: "返信文がありません", advice: "返信文に店舗名や地域名を入れて返信してください" };
  const brands = [placeName, ...keywords].filter((k) => k.trim().length > 0);
  const hit = foundKeywords(body, brands);
  return hit.length > 0
    ? { status: "pass", detail: `返信文に含む: ${hit.join("、")}` }
    : { status: "fail", detail: "返信文に店舗名・対策キーワードを含んでいません", advice: "「○○（店舗名）をご利用いただき…」のように、店舗名や地域名を返信文に自然に入れてください" };
}

/* ───────────── 採点 ───────────── */

export function scoreProfile(
  place: PlaceDetail,
  now = new Date(),
  owner: MeoOwnerData | null = null,
  options: ScoreOptions = {},
): ProfileScore {
  const extended = options.extended !== false;
  const W: Record<string, number> = extended ? WEIGHTS.extended : WEIGHTS.base;
  const w = (id: keyof typeof WEIGHTS.extended): number => W[id] ?? 0;
  const checks: ProfileCheck[] = [];

  // ── 基本情報（配点 40） ──
  checks.push(
    check(
      { id: "status", category: "basics", label: "営業ステータス", question: "営業中として登録されているか", weight: w("status") },
      place.status === "OPERATIONAL"
        ? { status: "pass", detail: "営業中として登録されています" }
        : place.status === "UNKNOWN"
          ? { status: "warn", detail: "ステータスを取得できませんでした" }
          : {
              status: "fail",
              detail: place.status === "CLOSED_TEMPORARILY" ? "臨時休業になっています" : "閉業になっています",
              advice: "営業しているなら、ビジネス プロフィールでステータスを「営業中」に戻してください",
            },
    ),
    check(
      { id: "name", category: "basics", label: "ビジネス名", question: "ビジネス名に不要なキーワードを詰め込んでいないか", weight: w("name") },
      looksKeywordStuffed(place.name)
        ? {
            status: "warn",
            detail: `「${place.name}」`,
            advice: "店名以外の語（地域名・サービス名・装飾記号）はガイドライン違反になり、停止の原因になります。正式名称だけにしてください",
          }
        : { status: "pass", detail: `「${place.name}」` },
    ),
    check(
      { id: "category", category: "basics", label: "メインカテゴリ", question: "サービス内容に最もマッチするカテゴリが設定されているか", weight: w("category") },
      place.category
        ? { status: "pass", detail: place.category }
        : { status: "fail", detail: "カテゴリが設定されていません", advice: "業種に最も近いカテゴリを 1 つ設定してください" },
    ),
    fromOwner({ id: "description", category: "basics", label: "ビジネスの説明", question: "ビジネスの説明文が正しく設定されているか", weight: w("description") }, judgeDescription(owner)),
    fromOwner({ id: "openingDate", category: "basics", label: "開業日", question: "開業日を設定しているか", weight: w("openingDate") }, judgeOpeningDate(owner)),
    check(
      { id: "address", category: "basics", label: "住所", question: "都道府県・市区町村・番地・ビル名が正しく設定されているか", weight: w("address") },
      place.address
        ? {
            status: "pass",
            detail:
              place.hasBuilding === true
                ? `${place.address}（ビル名・階まで登録あり）`
                : place.hasBuilding === false
                  ? `${place.address}（ビル名・階の登録なし。路面店なら不要）`
                  : place.address,
          }
        : { status: "fail", detail: "住所が登録されていません", advice: "住所を登録して所有権を確認してください" },
    ),
    check(
      { id: "hours", category: "basics", label: "営業時間設定", question: "営業時間が設定されているか", weight: w("hours") },
      place.hours.length > 0
        ? { status: "pass", detail: `${place.hours.length} 曜日分が登録されています` }
        : { status: "fail", detail: "営業時間が登録されていません", advice: "曜日ごとの営業時間を登録してください。「営業中」の表示に直結します" },
    ),
    check(
      { id: "hoursAccuracy", category: "basics", label: "営業時間正確性", question: "曜日ごとの営業時間が漏れなく設定されているか", weight: w("hoursAccuracy") },
      (() => {
        const state = hoursLookComplete(place.hours);
        if (state === "complete") return { status: "pass" as const, detail: "7 曜日分が揃っています" };
        if (state === "partial") {
          return {
            status: "warn" as const,
            detail: `${place.hours.length} 曜日分のみ、または全日が定休日になっています`,
            advice: "7 曜日すべての営業時間（定休日を含む）を設定し、祝日や臨時休業は「特別営業時間」で登録してください",
          };
        }
        return { status: "warn" as const, detail: "営業時間が無いため判断できません" };
      })(),
    ),
    fromOwner({ id: "menu", category: "basics", label: "メニュー、サービス", question: "メニューまたはサービスを設定しているか", weight: w("menu") }, judgeMenu(owner)),
    check(
      { id: "website", category: "basics", label: "店舗 HP URL", question: "店舗のウェブサイト URL を設定しているか", weight: w("website") },
      place.website
        ? { status: "pass", detail: place.website }
        : { status: "fail", detail: "ウェブサイトが登録されていません", advice: "自社サイトの URL を登録すると、マップから自社サイトへ誘導できます" },
    ),
    check(
      { id: "phone", category: "basics", label: "電話番号", question: "店舗の電話番号が設定されているか", weight: w("phone") },
      place.phone
        ? { status: "pass", detail: place.phone }
        : { status: "fail", detail: "電話番号が登録されていません", advice: "マップからの電話問い合わせを受けるため、電話番号を登録してください" },
    ),
  );
  if (extended) {
    const extraBase = { id: "extraCategories", category: "basics" as const, label: "追加カテゴリ", question: "メイン以外の追加カテゴリを設定しているか", weight: w("extraCategories") };
    const attrBase = { id: "attributes", category: "basics" as const, label: "属性（設備・サービス）", question: `決済方法・駐車場・バリアフリーなどの属性を ${ATTRIBUTES_GOOD} 個以上設定しているか`, weight: w("attributes") };
    checks.push(
      place.extraTypes === undefined
        ? notFetched(extraBase)
        : check(
            extraBase,
            place.extraTypes.length > 0
              ? { status: "pass", detail: `${place.extraTypes.length} 個: ${place.extraTypes.join(", ")}` }
              : { status: "warn", detail: "追加カテゴリがありません", advice: "提供するサービスに合う追加カテゴリを 1〜3 個設定すると、関連する検索にも出やすくなります" },
          ),
      place.attributes === undefined
        ? notFetched(attrBase)
        : check(
            attrBase,
            place.attributes.length >= ATTRIBUTES_GOOD
              ? { status: "pass", detail: `${place.attributes.length} 個が設定済み` }
              : place.attributes.length > 0
                ? { status: "warn", detail: `${place.attributes.length} 個が設定済み`, advice: "決済方法・駐車場・予約可否・バリアフリーなど、当てはまる属性をすべて設定してください。検索の絞り込みに使われます" }
                : { status: "fail", detail: "属性が 1 つも設定されていません", advice: "ビジネス プロフィールの「情報」→「属性」から、当てはまるものをすべて設定してください" },
          ),
    );
  }

  // ── 投稿（配点 10）。すべてオーナー申告 ──
  checks.push(
    fromOwner({ id: "postFrequency", category: "posts", label: "投稿頻度", question: "週に 1 投稿以上しているか", weight: w("postFrequency") }, judgePostFrequency(owner)),
    fromOwner({ id: "postKeywords", category: "posts", label: "最新情報でのキーワード使用", question: "最新投稿の文章にキーワードを含めて投稿しているか", weight: w("postKeywords") }, judgePostKeywords(owner)),
  );

  // ── 写真（配点 15） ──
  checks.push(
    check(
      { id: "photos", category: "photos", label: "写真投稿数", question: `${PHOTO_GOOD} 枚以上の写真が投稿されているか`, weight: w("photos") },
      place.photoCount >= PHOTO_GOOD
        ? { status: "pass", detail: `${place.photoCount} 枚以上` }
        : place.photoCount > 0
          ? { status: "warn", detail: `${place.photoCount} 枚`, advice: `外観・内観・商品などを ${PHOTO_GOOD} 枚以上載せると、比較されたときに選ばれやすくなります` }
          : { status: "fail", detail: "写真がありません", advice: "外観・内観・商品の写真を追加してください" },
    ),
  );
  if (extended) {
    const ownerBase = { id: "ownerPhotos", category: "photos" as const, label: "オーナー投稿の写真", question: `Google が表示する写真のうち、オーナー投稿が ${OWNER_PHOTOS_GOOD} 枚以上あるか`, weight: w("ownerPhotos") };
    const qualityBase = { id: "photoQuality", category: "photos" as const, label: "写真の解像度", question: `長辺 ${PHOTO_MIN_PX}px 未満の低解像度の写真が無いか`, weight: w("photoQuality") };
    const photos = place.photos;
    if (photos === undefined) {
      checks.push(notFetched(ownerBase), notFetched(qualityBase));
    } else {
      const withAuthor = photos.filter((ph) => ph.author !== null);
      const ownerCount = photos.filter((ph) => ph.author !== null && sameName(ph.author, place.name)).length;
      checks.push(
        photos.length === 0
          ? check(ownerBase, { status: "fail", detail: "写真がありません", advice: "オーナーとして外観・内観・商品の写真を投稿してください" })
          : withAuthor.length === 0
            ? { ...ownerBase, source: "places", status: "unavailable", detail: "投稿者の情報を取得できませんでした" }
            : check(
                ownerBase,
                ownerCount >= OWNER_PHOTOS_GOOD
                  ? { status: "pass", detail: `${photos.length} 枚中 ${ownerCount} 枚がオーナー投稿` }
                  : ownerCount > 0
                    ? { status: "warn", detail: `${photos.length} 枚中 ${ownerCount} 枚がオーナー投稿`, advice: "利用者の写真ばかりだと見せたい印象を作れません。オーナーとして外観・内観・商品・スタッフの写真を増やしてください" }
                    : { status: "fail", detail: `${photos.length} 枚ともオーナー投稿ではありません`, advice: "Google が表示する写真が利用者投稿だけです。オーナーとして写真を投稿してください" },
              ),
      );
      const sized = photos.filter((ph) => ph.widthPx !== null && ph.heightPx !== null);
      const low = sized.filter((ph) => Math.max(ph.widthPx ?? 0, ph.heightPx ?? 0) < PHOTO_MIN_PX).length;
      checks.push(
        sized.length === 0
          ? { ...qualityBase, source: "places", status: "unavailable", detail: photos.length === 0 ? "写真がありません" : "写真の大きさを取得できませんでした" }
          : check(
              qualityBase,
              low === 0
                ? { status: "pass", detail: `${sized.length} 枚とも ${PHOTO_MIN_PX}px 以上` }
                : { status: "warn", detail: `${sized.length} 枚中 ${low} 枚が低解像度`, advice: "小さい・粗い写真は差し替えてください。スマートフォンの通常撮影（長辺 2,000px 以上）で十分です" },
            ),
      );
    }
  }
  checks.push(
    fromOwner({ id: "photoFreshness", category: "photos", label: "写真の投稿頻度", question: "オーナーが最近投稿した写真が 1 か月以内にあるか", weight: w("photoFreshness") }, judgePhotoFreshness(owner, now)),
    fromOwner({ id: "logoCover", category: "photos", label: "ロゴ＆カバー写真", question: "ロゴ・カバー写真が設定されているか", weight: w("logoCover") }, judgeLogoCover(owner)),
  );

  // ── レビュー（配点 35） ──
  const rating = place.rating;
  const count = place.ratingCount;
  const age = latestReviewAgeDays(place, now);
  checks.push(
    check(
      { id: "rating", category: "reviews", label: "平均評価", question: `星の評価が ${RATING_GOOD} 以上になっているか`, weight: w("rating") },
      rating === null
        ? { status: "warn", detail: "評価がまだありません" }
        : rating >= RATING_GOOD
          ? { status: "pass", detail: rating.toFixed(1) }
          : rating >= RATING_OK
            ? { status: "warn", detail: rating.toFixed(1), advice: "低評価の口コミに丁寧に返信し、指摘された点を改善してください" }
            : { status: "fail", detail: rating.toFixed(1), advice: `評価が ${RATING_OK} を下回っています。指摘の多い点から改善してください` },
    ),
    check(
      { id: "reviewCount", category: "reviews", label: "クチコミ投稿件数", question: `クチコミの投稿件数が ${REVIEW_GOOD} 件以上になっているか`, weight: w("reviewCount") },
      count === null
        ? { status: "warn", detail: "件数を取得できませんでした" }
        : count >= REVIEW_GOOD
          ? { status: "pass", detail: `${count} 件` }
          : count >= REVIEW_SOME
            ? { status: "warn", detail: `${count} 件`, advice: `来店客に口コミを依頼し、${REVIEW_GOOD} 件以上を目指してください` }
            : { status: "fail", detail: `${count} 件`, advice: "口コミが少ないと比較で不利です。来店客への依頼を仕組みにしてください" },
    ),
    fromOwner({ id: "reviewReply", category: "reviews", label: "クチコミへの返信", question: "返信文に店舗名や地域名などブランディングしているキーワードが含まれているか", weight: w("reviewReply") }, judgeReviewReply(owner, place.name)),
    fromOwner({ id: "replyRate", category: "reviews", label: "クチコミ返信率", question: "クチコミの返信が 90% 以上になっているか", weight: w("replyRate") }, judgeReplyRate(owner, count)),
    check(
      { id: "recent", category: "reviews", label: "クチコミの新しさ", question: `直近 ${RECENT_DAYS} 日以内に口コミがあるか`, weight: w("recent") },
      age === null
        ? { status: "warn", detail: "口コミの日付を取得できませんでした" }
        : age <= RECENT_DAYS
          ? { status: "pass", detail: `最新は ${age} 日前` }
          : age <= STALE_DAYS
            ? { status: "warn", detail: `最新は ${age} 日前`, advice: "最近の口コミが無いと活動していない印象になります。継続して依頼してください" }
            : { status: "fail", detail: `最新は ${age} 日前`, advice: "1 年以上口コミがありません。来店客への依頼を再開してください" },
    ),
  );
  if (extended) {
    const withText = place.reviews.filter((r) => r.text.trim().length > 0);
    const terms = [...(owner?.input.keywords ?? []), ...(place.category ? [place.category] : [])];
    const kwBase = { id: "reviewKeywords", category: "reviews" as const, label: "口コミ内のキーワード", question: "口コミの本文に業種名や対策キーワードが含まれているか", weight: w("reviewKeywords") };
    const textBase = { id: "reviewText", category: "reviews" as const, label: "口コミ本文の充実度", question: `星だけでなく ${REVIEW_TEXT_MIN_CHARS} 文字以上の本文がある口コミが ${Math.round(REVIEW_TEXT_GOOD_RATIO * 100)}% 以上か`, weight: w("reviewText") };
    const alertBase = { id: "consumerAlert", category: "reviews" as const, label: "Google の警告", question: "不審な口コミ活動やポリシー違反の警告が出ていないか", weight: w("consumerAlert") };
    if (withText.length === 0) {
      checks.push({ ...kwBase, source: "places", status: "unavailable", detail: "本文のある口コミを取得できませんでした" });
    } else if (terms.length === 0) {
      checks.push(check(kwBase, { status: "warn", detail: "判定に使う語（カテゴリ・対策キーワード）がありません", advice: "「オーナー情報の入力」で対策キーワードを設定すると判定できます" }));
    } else {
      const hit = withText.filter((r) => foundKeywords(r.text, terms).length > 0).length;
      checks.push(
        check(
          kwBase,
          hit > 0
            ? { status: "pass", detail: `${withText.length} 件中 ${hit} 件に含む（${terms.join("、")}）` }
            : { status: "warn", detail: `${withText.length} 件とも含まない（${terms.join("、")}）`, advice: "「何を・どこで」が伝わる口コミ（例: 渋谷でカットと縮毛矯正）は検索との関連が強まります。依頼時にひと言添えてもらってください" },
        ),
      );
    }
    if (place.reviews.length === 0) {
      checks.push({ ...textBase, source: "places", status: "unavailable", detail: "口コミを取得できませんでした" });
    } else {
      const long = place.reviews.filter((r) => r.text.trim().length >= REVIEW_TEXT_MIN_CHARS).length;
      const ratio = long / place.reviews.length;
      checks.push(
        check(
          textBase,
          ratio >= REVIEW_TEXT_GOOD_RATIO
            ? { status: "pass", detail: `${place.reviews.length} 件中 ${long} 件に本文あり` }
            : { status: "warn", detail: `${place.reviews.length} 件中 ${long} 件に本文あり`, advice: "星だけの口コミが多いと内容が伝わりません。感想をひと言書いてもらうよう依頼してください" },
        ),
      );
    }
    checks.push(
      place.consumerAlert === undefined
        ? notFetched(alertBase)
        : check(
            alertBase,
            place.consumerAlert === null
              ? { status: "pass", detail: "警告は出ていません" }
              : { status: "fail", detail: `Google の警告: ${place.consumerAlert}`, advice: "口コミの購入や自作自演、ガイドライン違反が疑われています。該当する行為をやめ、Google の案内に従って解消してください。放置すると口コミの非表示や停止につながります" },
          ),
    );
  }

  const categories = CATEGORY_ORDER.map((id) => summarize(id, checks.filter((c) => c.category === id)));
  const overall = tally(checks);
  return {
    extended,
    score: overall.score,
    grade: overall.score === null ? null : gradeOf(overall.score),
    measuredWeight: overall.measured,
    totalWeight: overall.total,
    categories,
    checks,
  };
}

function tally(checks: readonly ProfileCheck[]): { score: number | null; measured: number; total: number } {
  let earned = 0;
  let measured = 0;
  let total = 0;
  for (const c of checks) {
    total += c.weight;
    if (c.status === "unavailable") continue;
    measured += c.weight;
    earned += c.weight * FACTOR[c.status];
  }
  return { score: measured > 0 ? Math.round((earned / measured) * 100) : null, measured, total };
}

function summarize(id: CategoryId, checks: ProfileCheck[]): CategoryScore {
  const { score } = tally(checks);
  return {
    id,
    label: CATEGORY_LABELS[id],
    score,
    grade: score === null ? null : gradeOf(score),
    measured: checks.filter((c) => c.status !== "unavailable").length,
    total: checks.length,
    checks,
  };
}
