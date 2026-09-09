/**
 * Google マップ（MEO）画面で選んだ自社・競合の店舗。ブラウザに保存する。
 *
 * 保存するのは Place ID と表示名だけ。詳細はサーバーが Google から取り直す。
 */
import { z } from "zod";
import { MAX_COMPETITORS } from "@/lib/maps/types";
import { createStore } from "./createStore";

export const PlaceRefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const MapsSelectionSchema = z.object({
  /** 最後に検索した語句（画面を開き直したときに入れておく） */
  query: z.string(),
  own: PlaceRefSchema.nullable(),
  competitors: z.array(PlaceRefSchema).max(MAX_COMPETITORS),
});

export type PlaceRef = z.infer<typeof PlaceRefSchema>;
export type MapsSelection = z.infer<typeof MapsSelectionSchema>;

export const EMPTY_MAPS_SELECTION: MapsSelection = { query: "", own: null, competitors: [] };

export const mapsSelectionStore = createStore<MapsSelection>("mapsSelection", MapsSelectionSchema, EMPTY_MAPS_SELECTION);

/** 自社にする。競合に入っていれば競合からは外す */
export function selectOwn(prev: MapsSelection, place: PlaceRef): MapsSelection {
  return { ...prev, own: place, competitors: prev.competitors.filter((c) => c.id !== place.id) };
}

/** 競合に加える / 外す。自社と同じ店舗は入れない。上限を超えたら何もしない */
export function toggleCompetitor(prev: MapsSelection, place: PlaceRef): MapsSelection {
  if (prev.own?.id === place.id) return prev;
  if (prev.competitors.some((c) => c.id === place.id)) {
    return { ...prev, competitors: prev.competitors.filter((c) => c.id !== place.id) };
  }
  if (prev.competitors.length >= MAX_COMPETITORS) return prev;
  return { ...prev, competitors: [...prev.competitors, place] };
}
