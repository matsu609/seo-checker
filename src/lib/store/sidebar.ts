/**
 * サイドバーのタブ（SEO / AIO / MEO）の選択。ブラウザに保存する。
 *
 * 開いている画面がどれかのタブに属していればそちらを優先し、
 * 設定や無料診断など共通の画面では最後に選んだタブを出す。
 */
import { z } from "zod";
import { createStore } from "./createStore";

export const SidebarTabSchema = z.object({
  tab: z.enum(["seo", "aio", "meo"]),
});

export type SidebarTab = z.infer<typeof SidebarTabSchema>;

export const DEFAULT_SIDEBAR_TAB: SidebarTab = { tab: "seo" };

export const sidebarTabStore = createStore<SidebarTab>("sidebarTab", SidebarTabSchema, DEFAULT_SIDEBAR_TAB);
