/**
 * 通知の設定（ブラウザ側ストア。サーバーは user_stores の写しを同じスキーマで読む）。
 *
 * 置き場所を「設定」に集約する方針（2026-09-19）に合わせ、ここには形と既定値だけを置く。
 * 宛先が空なら Clerk の主メールに送る（設定画面にもそう書く）。
 */
import { z } from "zod";
import { createStore } from "@/lib/store/createStore";

export const NOTIFICATION_SETTINGS_STORE = "notificationSettings";

export const NotificationSettingsSchema = z.object({
  /** メールでも受け取る（false なら画面のお知らせだけ） */
  email: z.boolean(),
  /** 宛先。空ならログインのメールアドレス */
  address: z.string().max(200),
  /** 月次レポートをメールで受け取る */
  monthlyReport: z.boolean(),
  /** 変化の知らせ（順位の急落・サイトの事故・掲載の消失・低評価・投稿の失敗）をメールで受け取る */
  alerts: z.boolean(),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { email: true, address: "", monthlyReport: true, alerts: true };

export const notificationSettingsStore = createStore<NotificationSettings>(
  NOTIFICATION_SETTINGS_STORE,
  NotificationSettingsSchema,
  DEFAULT_NOTIFICATION_SETTINGS,
);

/** 任意の値（user_stores の写し）→ 設定。壊れていれば既定値 */
export function parseNotificationSettings(value: unknown): NotificationSettings {
  const parsed = NotificationSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS;
}

export type NotificationChannel = "alert" | "report";

/** その種類の通知をメールで送ってよいか（純粋） */
export function wantsEmail(settings: NotificationSettings, channel: NotificationChannel): boolean {
  if (!settings.email) return false;
  return channel === "report" ? settings.monthlyReport : settings.alerts;
}
