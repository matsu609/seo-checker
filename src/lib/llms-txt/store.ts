"use client";

/**
 * llms.txt ウィザードの入力（localStorage）。
 *
 * 6 ステップぶんの入力をまとめて保存する。途中でリロードしても
 * 入力が消えないことがこのツールの前提（項目が多いため）。
 */

import { z } from "zod";
import { createStore, newId } from "@/lib/store/createStore";
import { SECTION_ORDER, type LlmsPage, type LlmsTxtState } from "./types";

const SectionSchema = z.enum(SECTION_ORDER);

const PageSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string(),
  section: SectionSchema,
  enabled: z.boolean(),
});

const AuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string(),
});

const StateSchema = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  allowCrawl: z.boolean(),
  siteUrl: z.string(),
  siteName: z.string(),
  summary: z.string(),
  details: z.string(),
  languages: z.array(z.string()),
  includePaths: z.string(),
  excludePaths: z.string(),
  limit: z.number().int().positive(),
  companyName: z.string(),
  companySummary: z.string(),
  companyAddress: z.string(),
  companyContact: z.string(),
  companyUrl: z.string(),
  pages: z.array(PageSchema),
  authors: z.array(AuthorSchema),
  rssUrl: z.string(),
  sitemapUrl: z.string(),
});

export const INITIAL_STATE: LlmsTxtState = {
  step: 1,
  allowCrawl: true,
  siteUrl: "",
  siteName: "",
  summary: "",
  details: "",
  languages: ["日本語"],
  includePaths: "",
  excludePaths: "/wp-admin\n/search\n/tag",
  limit: 30,
  companyName: "",
  companySummary: "",
  companyAddress: "",
  companyContact: "",
  companyUrl: "",
  pages: [],
  authors: [],
  rssUrl: "",
  sitemapUrl: "",
};

export const llmsTxtStore = createStore<LlmsTxtState>("llmsTxt", StateSchema, INITIAL_STATE);

/** 候補ページ → 編集できる行 */
export function toPage(
  candidate: { url: string; title: string; description: string },
  section: LlmsPage["section"] = "主要コンテンツ",
): LlmsPage {
  return {
    id: newId(),
    url: candidate.url,
    title: candidate.title,
    description: candidate.description,
    section,
    enabled: true,
  };
}

/** 空の行（手で追加するとき） */
export function emptyPage(section: LlmsPage["section"] = "主要コンテンツ"): LlmsPage {
  return { id: newId(), url: "", title: "", description: "", section, enabled: true };
}

/** 配列の要素を 1 つ動かす（並べ替え）。範囲外は元の配列をそのまま返す */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
