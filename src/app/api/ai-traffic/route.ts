/**
 * POST /api/ai-traffic — 生成 AI 流入分析（B6）のデータ取得。
 *
 * GA4 の runReport を 2 本だけ呼び（src/lib/ai-traffic/report.ts）、
 * 「日 × 参照元 × チャネル」と「ランディングページ × 参照元 × キーイベント」を返す。
 * バケット分け（日 / 週 / 月）・指標切替（セッション / ユーザー）・AI 検索率の計算は
 * 画面側の src/lib/ai-traffic/aggregate.ts が同じ素データから行うので、
 * ここでは集計せずに日次の行をそのまま返す（トグルのたびに GA4 を叩かないため）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { fetchAiTrafficReport } from "@/lib/ai-traffic/report";
import { MAX_KEY_EVENT_NAMES, type AiTrafficResponse } from "@/lib/ai-traffic/types";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import {
  daysInRange,
  isIsoDate,
  normalizePropertyId,
  Ga4Error,
  type Ga4Client,
} from "@/lib/ga4";
import { normalizeHost } from "@/lib/ga4/ai-sources";
import { ga4UnavailableMessage, resolveGa4Client } from "@/lib/google/ga4";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GA4 の応答は同じ期間なら数分単位では変わらない（当日分は確定していない） */
const TTL_MS = 10 * 60 * 1000;
/** 1 件で数千行になることがあるので件数は絞る */
const CACHE_ENTRIES = 20;
/** 期間の上限（src/lib/ai-traffic/store.ts の MAX_RANGE_DAYS と合わせる） */
const MAX_RANGE_DAYS = 366;

const cache = globalCache<AiTrafficResponse>("aiTraffic", TTL_MS, CACHE_ENTRIES);

const BodySchema = z.object({
  /** 既定は GA4_PROPERTY_ID。同じサービスアカウントで見える別プロパティを指定できる */
  propertyId: z.string().max(40).optional(),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  /**
   * 比較単位。集計は画面側（aggregateTraffic）で行うため取得内容は変わらないが、
   * docs の仕様どおりのリクエストを 422 にしないよう受け取る。
   */
  granularity: z.enum(["day", "week", "month"]).optional(),
  /** 列に出すキーイベント名（GA4 の keyEvents:<name>） */
  keyEventNames: z.array(z.string().max(40)).max(MAX_KEY_EVENT_NAMES).optional(),
  /** ユーザーが追加した参照元辞書 */
  extraSources: z
    .array(z.object({ host: z.string().max(255), service: z.string().max(60) }))
    .max(100)
    .optional(),
  /** キャッシュを使わずに取り直す */
  refresh: z.boolean().optional(),
});

function badRequest(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** 同じ結果になる条件だけをキーにする（辞書はページ表の絞り込みとサービス判定に効く） */
function cacheKey(
  propertyId: string,
  startDate: string,
  endDate: string,
  keyEventNames: readonly string[],
  extras: readonly { host: string; service: string }[],
): string {
  const dict = extras
    .map((e) => `${normalizeHost(e.host)}=${e.service.trim()}`)
    .filter((s) => !s.startsWith("="))
    .sort()
    .join(",");
  return `${propertyId}|${startDate}|${endDate}|${[...keyEventNames].sort().join(",")}|${dict}`;
}

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "ai-traffic" });
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("リクエスト形式が不正です", 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("期間（startDate / endDate）を YYYY-MM-DD 形式で指定してください", 422);
  }

  const startDate = parsed.data.startDate.trim();
  const endDate = parsed.data.endDate.trim();
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return badRequest("期間（startDate / endDate）を YYYY-MM-DD 形式で指定してください", 422);
  }
  const days = daysInRange({ startDate, endDate });
  if (days <= 0) {
    return badRequest("終了日には開始日と同じ日か、それより後の日付を指定してください", 422);
  }
  if (days > MAX_RANGE_DAYS) {
    return badRequest(`期間は最大 ${MAX_RANGE_DAYS} 日までです`, 422);
  }

  const requestedProperty = parsed.data.propertyId ? normalizePropertyId(parsed.data.propertyId) : "";
  if (parsed.data.propertyId && !/^\d{1,20}$/.test(requestedProperty)) {
    return badRequest("プロパティ ID は数字で指定してください（例: 123456789）", 422);
  }

  const keyEventNames = parsed.data.keyEventNames ?? [];
  const extraSources = parsed.data.extraSources ?? [];

  // 連携しているユーザーは自分の GA4 プロパティを、していなければ
  // 環境変数のサービスアカウントを使う（src/lib/google/ga4.ts）
  let client: Ga4Client | null;
  try {
    client = (await resolveGa4Client(requestedProperty))?.client ?? null;
  } catch (err) {
    if (err instanceof Ga4Error) return badRequest(err.message, err.status);
    console.error("[ai-traffic] client error", err);
    return badRequest("GA4 の設定を読み込めませんでした", 500);
  }
  if (!client) {
    return badRequest(ga4UnavailableMessage("生成 AI 流入分析"), 503);
  }

  const key = cacheKey(client.propertyId, startDate, endDate, keyEventNames, extraSources);
  if (!parsed.data.refresh) {
    const hit = cache.get(key);
    if (hit) return Response.json(hit);
  }

  try {
    const report = await fetchAiTrafficReport(client, {
      startDate,
      endDate,
      keyEventNames,
      extraSources,
    });
    cache.set(key, report);
    return Response.json(report);
  } catch (err) {
    if (err instanceof Ga4Error) return badRequest(err.message, err.status);
    console.error("[ai-traffic] report error", err);
    return badRequest("GA4 のデータを取得できませんでした", 502);
  }
}
