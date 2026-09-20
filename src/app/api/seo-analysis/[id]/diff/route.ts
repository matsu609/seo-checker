/**
 * GET /api/seo-analysis/[id]/diff — その診断と、同じサイトの直前の診断との差分（直った / 悪化した）。
 * 直前の診断が無ければ { diff: null }。
 */
import { NextRequest } from "next/server";
import { isUuid } from "@/lib/api/ids";
import { NO_STORE } from "@/lib/api/headers";
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse } from "@/lib/db/supabase";
import { diffSheets, type SheetDiff } from "@/lib/seo-analysis/diff";
import { getRun, previousRun, type RunSummary } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export interface SeoAnalysisDiffResponse {
  diff: SheetDiff | null;
  previous: RunSummary | null;
}

export async function GET(_request: NextRequest, context: Context) {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "ID が不正です" }, { status: 400 });
  try {
    const run = await getRun(userId, id);
    if (!run) return Response.json({ error: "分析が見つかりません" }, { status: 404 });
    if (run.status === "failed") {
      const body: SeoAnalysisDiffResponse = { diff: null, previous: null };
      return Response.json(body, { headers: NO_STORE });
    }
    const prev = await previousRun(userId, run.origin, run.createdAt, run.id);
    if (!prev) {
      const body: SeoAnalysisDiffResponse = { diff: null, previous: null };
      return Response.json(body, { headers: NO_STORE });
    }
    const prevDetail = await getRun(userId, prev.id);
    const body: SeoAnalysisDiffResponse = { diff: prevDetail ? diffSheets(prevDetail.sheet, run.sheet, { prev: prevDetail.audit, next: run.audit }) : null, previous: prev };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
