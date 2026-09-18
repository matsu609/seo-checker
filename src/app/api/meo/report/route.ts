/**
 * POST /api/meo/report（ログイン不要）
 * 無料 MEO 診断の報告書。自社 1 店舗ぶんの公開情報を採点して返す。
 *
 * 有料版（/api/maps/stores）との違い: 保存しない・競合なし・AI 総評なし・取り直し不可。
 * 詳細取得は有料版と同じ 6 時間キャッシュ（fetch.ts）を共有し、
 * キャッシュに当たった分は上限を消費しない（Google に費用が出ないため）。
 * クライアント（IP）ごと 10 回 / 時、全体 500 回 / 日（FREE_MEO_DAILY_LIMIT）。
 */
import { z } from "zod";
import {
  CLIENT_LIMIT_MESSAGE,
  clientKeyOf,
  envInt,
  FREE_LIMIT_MESSAGE,
  FREE_MEO_DAILY_REPORTS_DEFAULT,
  FREE_MEO_REPORT_PER_HOUR,
  takeClientToken,
  takeDailyToken,
} from "@/lib/free/ratelimit";
import { consumeFreeRun, requireFreeUser } from "@/lib/free/quota";
import { isPlacesConfigured, placesErrorResponse } from "@/lib/maps/client";
import { getPlaceCached, peekPlaceCached } from "@/lib/maps/fetch";
import { buildMeoReport, type MeoReport } from "@/lib/maps/report";
import type { ScoreOptions } from "@/lib/maps/score";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

/** 無料診断は r27 までの 21 項目（r28 で足した Google 取得の 7 項目は有料のみ） */
const FREE_SCORE: ScoreOptions = { extended: false };
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const BodySchema = z.object({ placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません") });

export interface FreeMeoReportResponse {
  report: MeoReport;
  cached: boolean;
}


export async function POST(request: Request) {
  if (!isPlacesConfigured()) {
    return Response.json({ error: "店舗診断は現在準備中です。", code: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  // 無料診断は登録（ログイン）したメールアドレスごとに回数制限（利用者の決定 2026-09-18）
  const denied = await requireFreeUser();
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  const { placeId } = parsed.data;

  // キャッシュにあれば上限を消費せずに返す（Google への費用が出ない）
  const hit = peekPlaceCached(placeId);
  if (hit) {
    const body: FreeMeoReportResponse = { report: buildMeoReport(hit, new Date(), null, FREE_SCORE), cached: true };
    return Response.json(body, { headers: NO_STORE });
  }
  if (!takeClientToken("meo-report", clientKeyOf(request), FREE_MEO_REPORT_PER_HOUR)) {
    return Response.json({ error: CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  if (!takeDailyToken("meo-report", envInt("FREE_MEO_DAILY_LIMIT", FREE_MEO_DAILY_REPORTS_DEFAULT))) {
    return Response.json({ error: FREE_LIMIT_MESSAGE, code: "daily_limit" }, { status: 429, headers: NO_STORE });
  }

  // キャッシュに無い = Google に問い合わせるときだけ 1 回ぶん消費する
  const exhausted = await consumeFreeRun();
  if (exhausted) return exhausted;
  try {
    const { detail, cached } = await getPlaceCached(placeId);
    const body: FreeMeoReportResponse = { report: buildMeoReport(detail, new Date(), null, FREE_SCORE), cached };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return placesErrorResponse(err);
  }
}
