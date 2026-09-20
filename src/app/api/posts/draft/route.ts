/**
 * POST /api/posts/draft { placeId, count, theme?, weekday?, hour? } … AI が下書きを count 本作り、
 * 毎週の予定日時（既定: 月曜 10:00）を付けて「下書き」で保存する。承認は画面で。
 */
import { z } from "zod";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { latestReports } from "@/lib/maps/history";
import { getOwnerInputOrNull } from "@/lib/maps/owner-store";
import { listStores } from "@/lib/maps/stores";
import { badRequest, NO_STORE, PLACE_ID, readJson, requirePostsUser } from "@/lib/posts/api";
import { generatePostDrafts } from "@/lib/posts/draft";
import { defaultScheduleDates } from "@/lib/posts/schedule";
import { insertPosts, listPosts } from "@/lib/posts/store";
import { DRAFT_COUNT_MAX, type GbpPost } from "@/lib/posts/types";
import { loadSharedSettings } from "@/lib/settings/server";
import { jstParts } from "@/lib/time/jst";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  count: z.number().int().min(1).max(DRAFT_COUNT_MAX).default(4),
  theme: z.string().max(500).default(""),
  weekday: z.number().int().min(0).max(6).default(1),
  hour: z.number().int().min(0).max(23).default(10),
});

export interface PostsDraftResponse {
  posts: GbpPost[];
}

export async function POST(request: NextRequestLike) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "投稿の保存には Supabase の設定が必要です", code: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!isAnthropicEnabled()) return Response.json({ error: "AI の下書きには ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { placeId, count, theme, weekday, hour } = parsed.data;
  try {
    const store = (await listStores(userId)).find((s) => s.role === "own" && s.placeId === placeId);
    if (!store) return Response.json({ error: "その店舗は MEO の自社店舗に登録されていません" }, { status: 404, headers: NO_STORE });
    const [report, owner, settings, existing] = await Promise.all([
      latestReports(userId, [placeId]).then((m) => m.get(placeId)?.report ?? null).catch(() => null),
      getOwnerInputOrNull(userId, placeId).catch(() => null),
      loadSharedSettings(userId),
      listPosts(userId, placeId),
    ]);
    const now = new Date();
    const p = jstParts(now);
    const keywords = [...new Set([...(owner?.input.keywords ?? []), ...settings.keywords])].slice(0, 8);
    const drafts = await generatePostDrafts(
      {
        storeName: report?.detail.name ?? store.name,
        category: report?.detail.category ?? settings.lead?.storeType ?? "",
        region: settings.lead?.region || report?.detail.address || "",
        keywords,
        month: `${p.year} 年 ${p.month} 月`,
        theme,
        recent: existing.filter((x) => x.status === "published" || x.status === "scheduled").slice(0, 6).map((x) => x.summary),
        count,
      },
      { signal: request.signal },
    );
    const dates = defaultScheduleDates(now, drafts.length, weekday, hour);
    const posts = await insertPosts(userId, placeId, drafts.map((d, i) => ({ ...d, scheduledAt: dates[i] ?? null, status: "draft" as const })), now);
    const body: PostsDraftResponse = { posts };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (err) {
    const info = toApiError(err);
    if (info.status !== 500) return Response.json({ error: info.message }, { status: info.status, headers: NO_STORE });
    return dbErrorResponse(err);
  }
}

type NextRequestLike = Request;
