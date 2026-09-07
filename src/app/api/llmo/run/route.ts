/**
 * POST /api/llmo/run — 登録プロンプト × モデルを実行し、言及・引用の判定まで返す。
 *
 * モデル単位の失敗はリクエスト全体の失敗にしない（1 社が落ちても他社の結果は返す）。
 * 状態は持たないので、履歴の積み上げはブラウザ側の llmoRuns ストアが行う。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { globalCache } from "@/lib/cache";
import { judgeAnswer } from "@/lib/llmo/judge";
import { PROVIDERS_META, PROVIDER_IDS, type ProviderId } from "@/lib/llmo/providers/meta";
import { PROVIDERS } from "@/lib/llmo/providers";
import {
  MAX_CALLS_PER_REQUEST,
  type LlmoEntity,
  type LlmoRunResponse,
  type LlmoRunRow,
  type ProviderResult,
} from "@/lib/llmo/types";
import { dateKey } from "@/lib/rank/classify";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 同じプロンプト × モデルを続けて押したときの二重課金を防ぐ */
const ANSWER_TTL_MS = 10 * 60 * 1000;
const answerCache = globalCache<ProviderResult>("llmoAnswers", ANSWER_TTL_MS, 60);

/** 同時に走らせる呼び出し数（各社のレート制限に配慮する） */
const CONCURRENCY = 4;

const EntitySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(120),
  domains: z.array(z.string().max(255)).max(20),
  brandAliases: z.array(z.string().max(120)).max(40),
  isSelf: z.boolean().optional(),
});

const PromptSchema = z.union([
  z.string().min(1).max(1_000),
  z.object({ id: z.string().min(1).max(100), text: z.string().min(1).max(1_000) }),
]);

const BodySchema = z.object({
  prompts: z.array(PromptSchema).min(1).max(MAX_CALLS_PER_REQUEST),
  models: z.array(z.enum(PROVIDER_IDS)).min(1),
  entities: z.array(EntitySchema).max(30).optional(),
});

interface NormalizedPrompt {
  id: string;
  text: string;
}

function normalizePrompts(input: z.infer<typeof BodySchema>["prompts"]): NormalizedPrompt[] {
  const out: NormalizedPrompt[] = [];
  input.forEach((p, i) => {
    const text = (typeof p === "string" ? p : p.text).trim();
    if (!text) return;
    out.push({ id: typeof p === "string" ? `p${i + 1}` : p.id, text });
  });
  return out;
}

/** 同時実行数を絞って全部走らせる（1 つの失敗で他を止めない） */
async function runPool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function cacheKey(providerId: ProviderId, model: string, prompt: string): string {
  return `${providerId}|${model}|${prompt}`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "プロンプトと対象モデルを指定してください（プロンプトは 1,000 文字以内）" },
      { status: 422 },
    );
  }

  const prompts = normalizePrompts(parsed.data.prompts);
  if (prompts.length === 0) {
    return Response.json({ error: "プロンプトを入力してください" }, { status: 422 });
  }
  const models = PROVIDER_IDS.filter((id) => parsed.data.models.includes(id));
  if (models.length === 0) {
    return Response.json({ error: "対象モデルを 1 つ以上選んでください" }, { status: 422 });
  }

  const calls = prompts.length * models.length;
  if (calls > MAX_CALLS_PER_REQUEST) {
    return Response.json(
      {
        error: `1 回の実行は ${MAX_CALLS_PER_REQUEST} 回（プロンプト数 × モデル数）までです。現在 ${prompts.length} × ${models.length} = ${calls} 回です。プロンプトかモデルを減らしてください`,
      },
      { status: 422 },
    );
  }

  const enabledModels = models.filter((id) => PROVIDERS[id].enabled());
  if (enabledModels.length === 0) {
    const envVars = models.map((id) => PROVIDERS_META[id].envVar).join(" / ");
    return Response.json(
      {
        error: `選択したモデルの API キーがサーバーに設定されていません。.env.local に ${envVars} を追加してください`,
      },
      { status: 503 },
    );
  }

  const entities: LlmoEntity[] = (parsed.data.entities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    domains: e.domains,
    brandAliases: e.brandAliases,
    ...(e.isSelf ? { isSelf: true } : {}),
  }));

  const skipped = models
    .filter((id) => !PROVIDERS[id].enabled())
    .map((id) => ({
      providerId: id,
      reason: `${PROVIDERS_META[id].envVar} が未設定のため実行しませんでした`,
    }));

  const tasks: (() => Promise<LlmoRunRow>)[] = [];
  for (const prompt of prompts) {
    for (const providerId of models) {
      const provider = PROVIDERS[providerId];
      tasks.push(async (): Promise<LlmoRunRow> => {
        const model = provider.model();
        const base = {
          promptId: prompt.id,
          promptText: prompt.text,
          providerId,
          model,
          fanoutSupported: PROVIDERS_META[providerId].fanoutSupported,
          citations: [],
          searchQueries: [],
          judgements: [],
          unclassified: [],
        };
        if (!provider.enabled()) {
          return {
            ...base,
            status: "error",
            error: `${PROVIDERS_META[providerId].envVar} が未設定です`,
            answer: "",
          };
        }
        const key = cacheKey(providerId, model, prompt.text);
        const result = answerCache.get(key) ?? (await provider.ask(prompt.text, { signal: request.signal }));
        if (!result.ok) {
          return { ...base, status: "error", error: result.error, answer: "" };
        }
        answerCache.set(key, result);
        const judged = judgeAnswer(result.answer, result.citations, entities);
        return {
          ...base,
          model: result.model,
          status: "ok",
          answer: result.answer,
          citations: result.citations,
          searchQueries: result.searchQueries,
          judgements: judged.judgements,
          unclassified: judged.unclassified,
          ...(result.usage ? { usage: result.usage } : {}),
        };
      });
    }
  }

  try {
    const rows = await runPool(tasks, CONCURRENCY);
    const response: LlmoRunResponse = {
      takenOn: dateKey(),
      measuredAt: new Date().toISOString(),
      rows,
      skipped,
    };
    return Response.json(response);
  } catch (err) {
    console.error("[llmo] run failed", err);
    return Response.json({ error: "実行中にエラーが発生しました" }, { status: 500 });
  }
}
