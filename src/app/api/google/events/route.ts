/**
 * GET  /api/google/events  連携中の GA4 に記録されているイベント名と、共通イベントへの
 *                          自動判定の結果を返す（docs/dev/diagnosis-rules-spec.md §5）。
 * POST /api/google/events  人が直した割り当てを保存する。
 *
 * 保存先は Clerk の privateMetadata（src/lib/google/settings.ts）。
 * 設定画面から呼ぶ。GA4 を 1 回叩くので、設定画面の初期表示では呼ばない。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { buildEventMapping, COMMON_EVENTS, unmappedEvents } from "@/lib/diagnosis/events";
import { GA4_DIAGNOSIS_DAYS } from "@/lib/diagnosis/sources/ga4";
import { dimensionValue, headerIndex, metricNumber, rangeForDays } from "@/lib/ga4";
import { resolveGa4Client } from "@/lib/google/ga4";
import { googleErrorResponse } from "@/lib/google/errors";
import { getLinkSettings, setEventMapping } from "@/lib/google/settings";

export const runtime = "nodejs";

/** イベント名の一覧を取る期間。診断と同じにする */
const DAYS = GA4_DIAGNOSIS_DAYS;
const LIMIT = 300;

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const resolved = await resolveGa4Client();
    if (!resolved) {
      return Response.json({ error: "GA4 と連携していません。先に GA4 のプロパティを選んでください。" }, { status: 400 });
    }
    const report = await resolved.client.runReport({
      dateRanges: [rangeForDays(DAYS)],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: LIMIT,
    });
    const at = {
      count: headerIndex(report.metricHeaders, "eventCount"),
      sessions: headerIndex(report.metricHeaders, "sessions"),
      keyEvents: headerIndex(report.metricHeaders, "keyEvents"),
    };
    const events = report.rows.map((row) => ({
      name: dimensionValue(row, 0),
      count: metricNumber(row, at.count),
      sessions: metricNumber(row, at.sessions),
      keyEvents: metricNumber(row, at.keyEvents),
    }));

    const settings = await getLinkSettings();
    const overrides = settings.eventMapping ?? {};
    const mapping = buildEventMapping(events.map((e) => e.name), overrides);

    return Response.json(
      {
        propertyId: resolved.client.propertyId,
        days: DAYS,
        events,
        mapping,
        overrides,
        unmapped: unmappedEvents(events.map((e) => e.name), mapping),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return googleErrorResponse(err);
  }
}

const BodySchema = z.object({
  mapping: z.record(z.enum(COMMON_EVENTS), z.array(z.string().min(1).max(200)).max(20)),
});

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }

  try {
    const settings = await setEventMapping(parsed.data.mapping);
    return Response.json({ settings }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
