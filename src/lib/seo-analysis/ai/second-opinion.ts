/**
 * セカンドオピニオン（ChatGPT）。サーバー専用。
 *
 * Claude と同じ事実シートと、Claude の改善案を渡し、「同意する点・食い違う点・
 * 追加の指摘」だけを返させる（全文を 2 本並べると読む負担が倍になるため。
 * 利用者の決定 2026-09-13）。OpenAI Responses API を fetch で叩く（SDK は足さない）。
 * OPENAI_API_KEY が無ければ null（Claude だけで完成する）。
 */
import { openaiModel } from "@/lib/llmo/providers/openai";
import { postJson } from "@/lib/llmo/providers/http";
import { untrustedLines } from "@/lib/page-diagnosis/analyze";
import { factsToLines } from "../sheet/build";
import type { SeoFactSheet } from "../sheet/types";
import { SecondOpinionSchema, type Analysis, type SecondOpinionRecord } from "./schema";

const ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_FACT_LINES = 400;

export function isSecondOpinionEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Responses API の json_schema（strict）。zod と同じ形を手で書く */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agreements", "disagreements", "additions"],
  properties: {
    agreements: { type: "array", items: { type: "string" } },
    disagreements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "claude", "chatgpt", "factIds"],
        properties: {
          topic: { type: "string" },
          claude: { type: "string" },
          chatgpt: { type: "string" },
          factIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    additions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "factIds"],
        properties: { text: { type: "string" }, factIds: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;

const INSTRUCTIONS = `あなたは SEO コンサルタントです。日本語で答えます。
別のアナリスト（Claude）が事実シートから書いた改善案を渡します。あなたは同じ事実シートだけを根拠に、
(1) 同意する点、(2) 食い違う点（結論・優先順位・原因の見立てが違うところ。何がどう違うか）、(3) Claude が触れていない追加の指摘、を返します。
事実シートに無い数値は使わず、主張には事実 ID（例: S-03）を factIds に入れます。同意する点は短く、食い違いと追加を優先します。`;

/** Responses API の出力テキストを取り出す（output_text を優先、無ければ output[].content[].text） */
function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.output_text === "string" && root.output_text) return root.output_text;
  const output = Array.isArray(root.output) ? root.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c && typeof c === "object" && typeof (c as Record<string, unknown>).text === "string") texts.push((c as Record<string, unknown>).text as string);
    }
  }
  return texts.length > 0 ? texts.join("") : null;
}

export async function generateSecondOpinion(
  sheet: SeoFactSheet,
  analysis: Analysis,
  options: { signal?: AbortSignal } = {},
): Promise<SecondOpinionRecord | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const facts = sheet.facts.slice(0, MAX_FACT_LINES);
  const claudeView = [
    `結論: ${analysis.headline}`,
    ...analysis.recommendations.map((r, i) => `${i + 1}. [優先度 ${r.priority}] ${r.title} — ${r.what}（根拠 ${r.factIds.join(", ")}）`),
    ...analysis.consultant.real.map((t) => `本当に言うべきこと: ${t}`),
  ];
  const input = [
    "事実シート（1 行 1 事実。先頭が事実 ID）:",
    ...untrustedLines(factsToLines(facts)),
    "",
    "Claude の分析:",
    ...untrustedLines(claudeView),
  ].join("\n");

  const model = openaiModel();
  const payload = await postJson(
    ENDPOINT,
    {
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model,
        instructions: INSTRUCTIONS,
        input,
        text: { format: { type: "json_schema", name: "second_opinion", strict: true, schema: JSON_SCHEMA } },
      },
      timeoutMs: 120_000,
      signal: options.signal,
    },
  );
  const text = outputText(payload);
  if (!text) throw new Error("ChatGPT の応答を読めませんでした");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("ChatGPT の応答が JSON ではありませんでした");
  }
  const parsed = SecondOpinionSchema.safeParse(json);
  if (!parsed.success) throw new Error("ChatGPT の応答の形が想定と違います");
  const known = new Set(facts.map((f) => f.id));
  const clean = (ids: string[]) => ids.filter((id) => known.has(id));
  return {
    opinion: {
      agreements: parsed.data.agreements,
      disagreements: parsed.data.disagreements.map((d) => ({ ...d, factIds: clean(d.factIds) })),
      additions: parsed.data.additions.map((a) => ({ ...a, factIds: clean(a.factIds) })),
    },
    model,
    generatedAt: new Date().toISOString(),
  };
}
