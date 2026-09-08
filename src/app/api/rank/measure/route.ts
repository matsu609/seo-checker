/**
 * POST /api/rank/measure — キーワードごとの順位・競合順位・AI Overviews 引用を返す。
 *
 * 1 キーワードにつき SERP は 1 回だけ呼び、自社・競合・AIO をすべてその結果から導く。
 * サーバーは状態を持たない（履歴の保存はブラウザ側の rankSnapshotsStore）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { measureFromSerp, runPool } from "@/lib/rank/measure";
import type { RankMeasureItem } from "@/lib/rank/types";
import { getSerpProvider } from "@/lib/serp";
import { SerpError } from "@/lib/serp/serpapi";
import type { SerpResult } from "@/lib/serp/types";

export const runtime = "nodejs";
/** 30 キーワード x 同時 3 本。SERP の応答が遅いときのために長めに取る */
export const maxDuration = 300;

const MAX_KEYWORDS = 30;
const MAX_COMPETITORS = 10;
const CONCURRENCY = 3;
/** 同じキーワードを短時間に取り直しても SerpApi のクレジットを減らさない */
const CACHE_TTL_MS = 10 * 60 * 1000;

const serpCache = globalCache<SerpResult>("rankSerp", CACHE_TTL_MS, 60);

const BodySchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(1).max(200),
        device: z.enum(["desktop", "mobile"]).optional(),
        location: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(MAX_KEYWORDS),
  projectDomain: z.string().min(1).max(255),
  competitorDomains: z.array(z.string().max(255)).max(MAX_COMPETITORS).optional(),
  includeAioText: z.boolean().optional(),
});

/** キャッシュには生 JSON を持たせない（1 件で数百 KB になる） */
function stripRaw(result: SerpResult): SerpResult {
  return { ...result, raw: null };
}

function cacheKey(keyword: string, device: string, location: string | undefined): string {
  return `${device}|${location ?? ""}|${keyword}`;
}

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  const provider = getSerpProvider();
  if (!provider) {
    return Response.json(
      { error: "順位計測には SerpApi の設定が必要です。サーバーに SERPAPI_KEY を設定してください" },
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
      { error: `入力が不正です（キーワードは 1〜${MAX_KEYWORDS} 件、自社ドメインは必須です）` },
      { status: 422 },
    );
  }
  const { keywords, projectDomain, competitorDomains = [], includeAioText = false } = parsed.data;

  // 同じキーワード + デバイス + 地域の重複は 1 回にまとめる
  const seen = new Set<string>();
  const targets = keywords
    .map((k) => ({ ...k, keyword: k.keyword.trim(), device: k.device ?? ("desktop" as const) }))
    .filter((k) => {
      if (!k.keyword) return false;
      const key = cacheKey(k.keyword, k.device, k.location);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (targets.length === 0) {
    return Response.json({ error: "キーワードを 1 件以上指定してください" }, { status: 422 });
  }

  let fatal: { status: number; message: string } | null = null;

  const results = await runPool(targets, CONCURRENCY, async (target): Promise<RankMeasureItem> => {
    const key = cacheKey(target.keyword, target.device, target.location);
    try {
      let serp = serpCache.get(key);
      if (!serp) {
        serp = stripRaw(
          await provider.search({
            q: target.keyword,
            device: target.device,
            ...(target.location ? { location: target.location } : {}),
          }),
        );
        serpCache.set(key, serp);
      }
      const measurement = measureFromSerp(serp, {
        projectDomain,
        competitorDomains,
        includeAioText,
        ...(target.location ? { location: target.location } : {}),
      });
      return { ok: true, ...measurement };
    } catch (err) {
      if (err instanceof SerpError) {
        // 鍵や利用上限の問題は全キーワードで同じように失敗するので、全滅時の HTTP ステータスに反映する
        if (err.code === "auth") fatal = { status: 503, message: err.message };
        else if (err.code === "rate_limit") fatal = fatal ?? { status: 429, message: err.message };
        return { ok: false, keyword: target.keyword, device: target.device, error: err.message };
      }
      console.error("[rank] unexpected error", err);
      return {
        ok: false,
        keyword: target.keyword,
        device: target.device,
        error: "検索結果の取得に失敗しました",
      };
    }
  });

  const failed = results.filter((r) => !r.ok).length;
  if (failed === results.length && fatal) {
    const info = fatal as { status: number; message: string };
    return Response.json({ error: info.message }, { status: info.status });
  }

  return Response.json({
    results,
    measuredAt: new Date().toISOString(),
    provider: provider.name,
  });
}
