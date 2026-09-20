/** お知らせの種類（画面のバッジと集計に使う。クライアントでも読める） */
export const NOTIFICATION_KINDS = [
  "rank_drop",
  "site_incident",
  "listing_check",
  "post_failed",
  "post_published",
  "review_low",
  "monthly_report",
  "seo_rediagnosis",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  rank_drop: "順位の変化",
  site_incident: "サイトの事故",
  listing_check: "掲載の確認",
  post_failed: "投稿の失敗",
  post_published: "投稿しました",
  review_low: "低評価の回答",
  monthly_report: "月次レポート",
  seo_rediagnosis: "精密診断（自動）",
};

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** アプリ内のパス（開くボタン） */
  link: string | null;
  createdAt: string;
  emailedAt: string | null;
  readAt: string | null;
}
