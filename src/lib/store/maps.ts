/**
 * Google マップ（MEO）画面の表示状態。ブラウザに保存する。
 *
 * 登録した店舗（自社・競合）はサーバー（Supabase）が持つ。ここに置くのは
 * 「最後に検索した語句」と「いま見ている自社店舗」だけ。
 */
import { z } from "zod";
import { createStore } from "./createStore";

export const MapsViewSchema = z.object({
  /** 最後に検索した語句（画面を開き直したときに入れておく） */
  query: z.string(),
  /** いま見ている自社店舗の Place ID（登録一覧に無ければ先頭の店舗にする） */
  currentOwnId: z.string().nullable(),
});

export type MapsView = z.infer<typeof MapsViewSchema>;

export const EMPTY_MAPS_VIEW: MapsView = { query: "", currentOwnId: null };

export const mapsViewStore = createStore<MapsView>("mapsView", MapsViewSchema, EMPTY_MAPS_VIEW);
