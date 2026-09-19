/**
 * ビジネス プロフィールへの投稿の画面の設定（最後に選んだビジネス・ボタンの既定）。ブラウザに保存する。
 * 投稿そのものは Google が持つ（このアプリは保存しない）。
 */
import { z } from "zod";
import { LOCAL_POST_ACTIONS } from "@/lib/posts/constants";
import { createStore } from "./createStore";

export const PostsSettingsSchema = z.object({
  /** 最後に選んだ Google ビジネス プロフィールのビジネス（accounts/…/locations/…） */
  location: z.string().nullable(),
  /** AI の下書きの材料にする MEO の自社店舗（Place ID） */
  placeId: z.string().nullable(),
  /** 投稿に付けるボタン（null = 付けない） */
  action: z.enum(LOCAL_POST_ACTIONS).nullable(),
  /** ボタンのリンク先（多くの店舗で毎回同じなので覚えておく） */
  actionUrl: z.string().max(500),
});

export type PostsSettings = z.infer<typeof PostsSettingsSchema>;

export const DEFAULT_POSTS_SETTINGS: PostsSettings = { location: null, placeId: null, action: null, actionUrl: "" };

export const postsSettingsStore = createStore<PostsSettings>("postsSettings", PostsSettingsSchema, DEFAULT_POSTS_SETTINGS);
