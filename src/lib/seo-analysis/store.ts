"use client";

/**
 * 精密診断の入力フォームの保存（ブラウザの localStorage）。
 * 結果そのものは Supabase に保存するので、ここには入力だけを残す。
 */
import { z } from "zod";
import { createStore } from "@/lib/store/createStore";

const FormSchema = z.object({
  keywords: z.string(),
  industry: z.string(),
  goal: z.enum(["inquiry", "ec", "recruit", "visit", "media", "other"]),
  region: z.string(),
  competitors: z.string(),
  brand: z.string(),
  maxPages: z.number().int().positive(),
});

export type SeoAnalysisForm = z.infer<typeof FormSchema>;

/**
 * 分析するサイトは設定に登録したホームページを使うので、ここには持たない
 * （利用者の指示 2026-09-16）。競合の URL だけは入力欄を残す。
 */
export const seoAnalysisFormStore = createStore<SeoAnalysisForm>("seoAnalysisForm", FormSchema, {
  keywords: "",
  industry: "",
  goal: "inquiry",
  region: "",
  competitors: "",
  brand: "",
  maxPages: 100,
});

/** 改行・カンマ区切りの文字列を配列に（空行は捨てる） */
export function splitLines(value: string, max: number): string[] {
  return [...new Set(value.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
}
