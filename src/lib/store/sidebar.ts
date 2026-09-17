/**
 * サイドバーのタブ（AIO / SEO / MEO）の選択。ブラウザに保存する。
 *
 * ここが唯一の「いま開いているタブ」。タブを押せば必ずここが変わり、
 * どれかのタブに属する画面へ移動したときはサイドバーがここを画面のタブに合わせる
 * （Sidebar.tsx）。設定や無料診断など共通の画面では最後に選んだタブのまま。
 */
import { z } from "zod";
import { DEFAULT_FEATURE_CATEGORY } from "@/lib/features/registry";
import { createStore } from "./createStore";

export const SidebarTabSchema = z.object({
  tab: z.enum(["seo", "aio", "meo"]),
});

export type SidebarTab = z.infer<typeof SidebarTabSchema>;

export const DEFAULT_SIDEBAR_TAB: SidebarTab = { tab: DEFAULT_FEATURE_CATEGORY };

export const sidebarTabStore = createStore<SidebarTab>("sidebarTab", SidebarTabSchema, DEFAULT_SIDEBAR_TAB);
