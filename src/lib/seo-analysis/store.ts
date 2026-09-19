"use client";

/**
 * 精密診断の入力フォームの保存（ブラウザの localStorage）。
 * 結果そのものは Supabase に保存するので、ここには入力だけを残す。
 *
 * キーワードと競合は **固定枠**（キーワード 5・競合 2。利用者の指示 2026-09-19「枠を 5 つ設ける」）。
 * 古い保存値（改行区切りの文字列）もそのまま読めるように、文字列なら配列に直してから検証する。
 */
import { z } from "zod";
import { createStore } from "@/lib/store/createStore";
import { MAX_COMPETITORS, MAX_KEYWORDS } from "./input";

/** 改行・カンマ区切りの文字列を配列に（空行は捨てる） */
export function splitLines(value: string, max: number): string[] {
  return [...new Set(value.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
}

/** 固定枠に揃える（足りなければ空文字で埋め、多ければ切る） */
export function toSlots(value: readonly string[] | string | undefined, size: number): string[] {
  const list = typeof value === "string" ? splitLines(value, size) : Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v : "")) : [];
  return Array.from({ length: size }, (_, i) => list[i] ?? "");
}

/** 枠 i の値を差し替える（位置は動かさない） */
export function withSlot(slots: readonly string[], index: number, value: string, size: number): string[] {
  const next = toSlots(slots, size);
  next[index] = value;
  return next;
}

/** 空の枠を除いた値（API に送る形。重複は除く） */
export function filledSlots(slots: readonly string[], max: number): string[] {
  return [...new Set(slots.map((s) => s.trim()).filter(Boolean))].slice(0, max);
}

const slotsSchema = (size: number) => z.preprocess((v) => toSlots(v as string | string[] | undefined, size), z.array(z.string()));

const FormSchema = z.object({
  keywords: slotsSchema(MAX_KEYWORDS),
  industry: z.string(),
  goal: z.enum(["inquiry", "ec", "recruit", "visit", "media", "other"]),
  region: z.string(),
  competitors: slotsSchema(MAX_COMPETITORS),
  brand: z.string(),
  /** 旧: クロールの上限。2026-09-18 から 200 固定なので使わない（古い保存値を読めるように残す） */
  maxPages: z.number().int().positive(),
});

export type SeoAnalysisForm = z.infer<typeof FormSchema>;

/**
 * 分析するサイトは設定に登録したホームページを使うので、ここには持たない
 * （利用者の指示 2026-09-16）。競合の URL だけは入力欄を残す。
 */
export const seoAnalysisFormStore = createStore<SeoAnalysisForm>("seoAnalysisForm", FormSchema, {
  keywords: toSlots([], MAX_KEYWORDS),
  industry: "",
  goal: "inquiry",
  region: "",
  competitors: toSlots([], MAX_COMPETITORS),
  brand: "",
  maxPages: 200,
});
