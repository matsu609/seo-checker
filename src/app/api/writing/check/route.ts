/**
 * POST /api/writing/check — 記事チェック（D4）。
 *
 * kind:
 *   fact  … 検証可能な主張を抽出して Web 検索で確認（要 ANTHROPIC_API_KEY）
 *   copy  … 40〜60 文字の文を完全一致検索（要 ANTHROPIC_API_KEY）
 *   yakki … 薬機法 NG 表現の辞書 + 文脈判定。辞書だけならキー無しでも動く
 *
 * 薬機法チェックは辞書が純粋な正規表現なのでブラウザ側でも実行できる。
 * このルートは文脈判定（誤検知の除去）を足すためのもの。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { llmYakkiJudge, runCopyCheck, runFactCheck, runYakkiCheck } from "@/lib/writing/check";
import { MAX_CHECK_CHARS } from "@/lib/writing/prompt";

export const runtime = "nodejs";
// 主張ごとに Web 検索するため長くなる
export const maxDuration = 300;

const BodySchema = z.object({
  kind: z.enum(["fact", "copy", "yakki"]),
  markdown: z.string().min(1).max(MAX_CHECK_CHARS * 2),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "チェックの種類と本文を送信してください" }, { status: 422 });
  }
  const { kind, markdown } = parsed.data;

  const anthropic = isAnthropicEnabled();
  if (!anthropic && kind !== "yakki") {
    return Response.json(
      {
        error:
          kind === "fact"
            ? "ファクトチェックには ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください"
            : "コピペチェックには ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください",
      },
      { status: 503 },
    );
  }

  try {
    if (kind === "fact") {
      return Response.json({ result: await runFactCheck(markdown, { signal: request.signal }) });
    }
    if (kind === "copy") {
      return Response.json({ result: await runCopyCheck(markdown, { signal: request.signal }) });
    }
    return Response.json({
      result: await runYakkiCheck(markdown, {
        judge: anthropic ? llmYakkiJudge : null,
        signal: request.signal,
      }),
    });
  } catch (err) {
    const info = toApiError(err);
    if (info.status !== 500) {
      return Response.json({ error: info.message }, { status: info.status });
    }
    console.error("[writing/check] unexpected error", err);
    return Response.json({ error: "記事チェック中にエラーが発生しました" }, { status: 500 });
  }
}
