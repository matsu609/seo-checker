/**
 * Search Console の実測を AI（Claude）に読ませて、現状分析とネクストアクションを作る。サーバー専用。
 * プロンプトと出力の形は analysis.ts（純関数）。
 */
import { generateStructured } from "@/lib/llm/structured";
import { SAFETY_RULES, untrustedBlock } from "@/lib/llm/prompt-safety";
import { ANALYSIS_SYSTEM, AnalysisOutputSchema, buildAnalysisPrompt, type AnalysisOutput } from "./analysis";
import type { SearchPerformanceResponse } from "./types";

export async function analyzeSearchPerformance(data: SearchPerformanceResponse): Promise<{ output: AnalysisOutput; model: string }> {
  const result = await generateStructured({
    schema: AnalysisOutputSchema,
    system: [ANALYSIS_SYSTEM, "", ...SAFETY_RULES].join("\n"),
    prompt: buildAnalysisPrompt(data, untrustedBlock),
    maxTokens: 4096,
    effort: "medium",
  });
  const output: AnalysisOutput = {
    summary: result.data.summary.trim(),
    // 3 件に揃える（多く返ってきても画面と保存は 3 件まで）
    actions: result.data.actions.filter((a) => a.action.trim()).slice(0, 3).map((a) => ({ target: a.target.trim(), action: a.action.trim() })),
  };
  return { output, model: result.message.model };
}
