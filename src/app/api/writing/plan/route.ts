/**
 * POST /api/writing/plan — 企画書モード（D2）。
 *
 * 入力: 内容（1,000 文字まで）、Google 検索結果を参考にするか、参考メモ、PDF（5MB まで）。
 * PDF は base64 で受け取り、必ず validatePdfUpload でサイズと形式を検証してから
 * Anthropic の document ブロック（citations 有効）として渡す。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generatePlan, PLAN_MODEL } from "@/lib/writing/plan";
import { MAX_PLAN_CONTENT_CHARS } from "@/lib/writing/prompt";
import type { PlanResult } from "@/lib/writing/types";
import { MAX_PDF_BASE64_LENGTH, validatePdfUpload } from "@/lib/writing/upload";

export const runtime = "nodejs";
// PDF 読み込み + Web 検索が入ると 60 秒では足りない
export const maxDuration = 300;

const BodySchema = z.object({
  content: z.string().min(1).max(MAX_PLAN_CONTENT_CHARS),
  useWebSearch: z.boolean().optional(),
  reference: z.string().max(8_000).optional(),
  keyword: z.string().max(200).optional(),
  pdf: z
    .object({
      name: z.string().max(255).optional(),
      mediaType: z.string().max(255),
      // 少し超えた程度なら validatePdfUpload に渡して 413 と案内を返す（極端に大きいものはここで 422）
      data: z.string().max(MAX_PDF_BASE64_LENGTH * 2),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "企画書の生成には ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: `書きたい内容を入力してください（${MAX_PLAN_CONTENT_CHARS} 文字以内）` },
      { status: 422 },
    );
  }

  // アップロードされたファイルは MIME も中身もサーバー側で検証する
  let pdf: { name: string; data: string } | undefined;
  if (parsed.data.pdf) {
    const check = validatePdfUpload(parsed.data.pdf);
    if (!check.ok) {
      return Response.json({ error: check.error }, { status: check.status });
    }
    pdf = { name: check.name, data: check.data };
  }

  try {
    const { plan, sources, searchQueries } = await generatePlan({
      content: parsed.data.content,
      useWebSearch: parsed.data.useWebSearch === true,
      ...(parsed.data.reference ? { reference: parsed.data.reference } : {}),
      ...(parsed.data.keyword ? { keyword: parsed.data.keyword } : {}),
      ...(pdf ? { pdf } : {}),
      signal: request.signal,
    });

    if (plan.outline.length === 0) {
      return Response.json({ error: "企画書を生成できませんでした。内容を具体的にして再試行してください" }, { status: 502 });
    }

    const notes: string[] = [];
    if (pdf) notes.push(`添付 PDF「${pdf.name}」を参考資料として読み込みました。`);
    if (parsed.data.useWebSearch === true) {
      notes.push(
        sources.length > 0
          ? `Google 検索結果を参考にしました（引用元 ${sources.length} 件）。`
          : "Web 検索を有効にしましたが、引用として使われた情報源はありませんでした。",
      );
    }

    const result: PlanResult = {
      id: `${Date.now().toString(36)}-plan`,
      plan,
      sources,
      searchQueries,
      notes,
      model: PLAN_MODEL,
      createdAt: new Date().toISOString(),
    };
    return Response.json({ result });
  } catch (err) {
    const info = toApiError(err);
    if (info.status !== 500) {
      return Response.json({ error: info.message }, { status: info.status });
    }
    console.error("[writing/plan] unexpected error", err);
    return Response.json({ error: "企画書の生成中にエラーが発生しました" }, { status: 500 });
  }
}
