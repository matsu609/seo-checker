/**
 * 精密診断の入力の検証（zod）。API とフォームの両方で使う。
 */
import { z } from "zod";
import type { AnalysisInput } from "./sheet/types";

export const MAX_KEYWORDS = 5;
export const MAX_COMPETITORS = 2;
export const PAGE_LIMITS = [50, 100, 200, 300] as const;

export const AnalysisInputSchema = z.object({
  url: z.string().trim().min(1, "URL を入力してください").max(500),
  keywords: z.array(z.string().trim().max(60)).max(MAX_KEYWORDS).default([]),
  industry: z.string().trim().max(60).default(""),
  goal: z.enum(["inquiry", "ec", "recruit", "visit", "media", "other"]).default("other"),
  region: z.string().trim().max(60).default(""),
  competitors: z.array(z.string().trim().max(300)).max(MAX_COMPETITORS).default([]),
  brand: z.string().trim().max(60).default(""),
  maxPages: z.number().int().min(10).max(300).default(100),
});

export function normalizeInput(raw: z.infer<typeof AnalysisInputSchema>): AnalysisInput {
  return {
    ...raw,
    keywords: [...new Set(raw.keywords.filter(Boolean))].slice(0, MAX_KEYWORDS),
    competitors: [...new Set(raw.competitors.filter(Boolean))].slice(0, MAX_COMPETITORS),
  };
}
