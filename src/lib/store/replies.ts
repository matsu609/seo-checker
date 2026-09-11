/**
 * 口コミへの返信画面の設定（トーン・店舗からの補足・署名・最後に選んだビジネス）。ブラウザに保存する。
 * 口コミと返信そのものは Google が持つ（このアプリは保存しない）。
 */
import { z } from "zod";
import { createStore } from "./createStore";

export const RepliesSettingsSchema = z.object({
  tone: z.enum(["polite", "casual", "friendly"]),
  ownerNote: z.string().max(500),
  signature: z.string().max(60),
  /** 最後に選んだ Google ビジネス プロフィールのビジネス（accounts/…/locations/…） */
  location: z.string().nullable(),
  /** 接続前のとき、最後に選んだ MEO の自社店舗（Place ID） */
  placeId: z.string().nullable(),
});

export type RepliesSettings = z.infer<typeof RepliesSettingsSchema>;

export const DEFAULT_REPLIES_SETTINGS: RepliesSettings = { tone: "polite", ownerNote: "", signature: "", location: null, placeId: null };

export const repliesSettingsStore = createStore<RepliesSettings>("repliesSettings", RepliesSettingsSchema, DEFAULT_REPLIES_SETTINGS);
