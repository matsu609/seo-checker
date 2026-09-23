/**
 * Google ビジネス プロフィールの投稿（最新情報・イベント・クーポン）の型。クライアントでも読める。
 *
 * 投稿の中身は Google の Local Posts（My Business API v4）に合わせる。本文は 1,500 文字まで、
 * イベント・クーポンは題名（58 文字）と期間が要る。
 */
export const POST_TOPICS = ["STANDARD", "EVENT", "OFFER"] as const;
export type PostTopic = (typeof POST_TOPICS)[number];
export const POST_TOPIC_LABELS: Record<PostTopic, string> = { STANDARD: "最新情報", EVENT: "イベント", OFFER: "クーポン・特典" };

/**
 * publishing（送信中）は 2026-09-23 に追加。Google に送る前に「送る権利」を取った印で、
 * 同じ投稿を定期処理と「今すぐ投稿」が同時に送る（二重投稿）のを防ぐ（store.ts の claimPost）。
 * gbp_posts.status は text で CHECK 制約が無いので、テーブルの変更は要らない。
 */
export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "failed", "cancelled"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  publishing: "送信中",
  published: "投稿済み",
  failed: "失敗",
  cancelled: "取り消し",
};

export const CTA_TYPES = ["NONE", "LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP", "CALL"] as const;
export type CtaType = (typeof CTA_TYPES)[number];
export const CTA_LABELS: Record<CtaType, string> = {
  NONE: "ボタンなし",
  LEARN_MORE: "詳細",
  BOOK: "予約",
  ORDER: "注文",
  SHOP: "購入",
  SIGN_UP: "登録",
  CALL: "電話（URL 不要）",
};

export const POST_SUMMARY_MAX = 1500;
export const POST_TITLE_MAX = 58;
/** 一度に作る下書きの上限 */
export const DRAFT_COUNT_MAX = 8;

export interface GbpPost {
  id: string;
  placeId: string;
  /** "accounts/…/locations/…"。投稿時に解決して控える */
  locationName: string | null;
  topicType: PostTopic;
  title: string;
  summary: string;
  ctaType: CtaType;
  ctaUrl: string;
  /** YYYY-MM-DD（イベント・クーポン） */
  eventStart: string | null;
  eventEnd: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  /** Google が付けた投稿の名前（accounts/…/localPosts/…） */
  googleName: string | null;
  /** 失敗の理由（画面にそのまま出す） */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 画面から送る編集内容 */
export interface PostInput {
  topicType: PostTopic;
  title: string;
  summary: string;
  ctaType: CtaType;
  ctaUrl: string;
  eventStart: string | null;
  eventEnd: string | null;
  scheduledAt: string | null;
}
