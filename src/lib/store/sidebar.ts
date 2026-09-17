/**
 * サイドバーで開いている柱（AIO 対策の中の SEO / MEO / サイテーション）。ブラウザに保存する。
 *
 * ここが唯一の「いま開いている柱」。見出しを押せば必ずここが変わり、
 * どれかの柱に属する画面へ移動したときはサイドバーがここを画面の柱に合わせる
 * （Sidebar.tsx）。設定や AI 検索モニタリングなど柱に属さない画面では最後に開いた柱のまま。
 */
import { z } from "zod";
import { DEFAULT_FEATURE_CATEGORY } from "@/lib/features/registry";
import { createStore } from "./createStore";

export const SidebarTabSchema = z.object({
  tab: z.enum(["seo", "meo", "citation"]),
});

export type SidebarTab = z.infer<typeof SidebarTabSchema>;

export const DEFAULT_SIDEBAR_TAB: SidebarTab = { tab: DEFAULT_FEATURE_CATEGORY };

export const sidebarTabStore = createStore<SidebarTab>("sidebarTab", SidebarTabSchema, DEFAULT_SIDEBAR_TAB);
