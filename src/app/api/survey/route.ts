/**
 * /api/survey … ツールについてのアンケート（ログイン必須。相手は**ツールを使っている事業者 = B**）。
 *
 *   GET  → { available, survey } いま出すべき回（無ければ survey: null）
 *   POST → { surveyId, status: "answered" | "snoozed", answers } 回答か「あとで」を記録
 *
 * 来店客に聞く口コミ支援のアンケート（/api/r/<slug>）とは別物。あちらは C 向けで公開、こちらは B 向けでログイン必須。
 */
import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { readJson } from "@/lib/api/request";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { leadFromMetadata, type LeadProfile } from "@/lib/free/lead";
import { findSurvey, MAX_QUESTIONS_PER_SURVEY, type SurveyDefinition } from "@/lib/survey/definitions";
import { dueSurvey } from "@/lib/survey/due";
import { listUserEvents, saveSurvey } from "@/lib/survey/store";

export const runtime = "nodejs";

export interface SurveyResponse {
  /** 保存先が使えるか（false なら画面は何も出さない） */
  available: boolean;
  survey: SurveyDefinition | null;
}

const BodySchema = z.object({
  surveyId: z.string().min(1).max(60),
  status: z.enum(["answered", "snoozed"]),
  answers: z.record(z.string().max(80), z.string().max(1_000)).default({}),
});

async function profile(): Promise<{ lead: LeadProfile | null; signedUpAtMs: number | null }> {
  if (!isAuthEnabled()) return { lead: null, signedUpAtMs: null };
  try {
    const user = await currentUser();
    if (!user) return { lead: null, signedUpAtMs: null };
    return { lead: leadFromMetadata(user.publicMetadata, user.unsafeMetadata), signedUpAtMs: user.createdAt ?? null };
  } catch {
    return { lead: null, signedUpAtMs: null };
  }
}

export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const empty: SurveyResponse = { available: false, survey: null };
  if (!isSupabaseConfigured()) return Response.json(empty, { headers: NO_STORE });

  const { signedUpAtMs } = await profile();
  // 登録日が読めない（Clerk 無効の開発環境など）と時期が決められないので、何も出さない
  if (signedUpAtMs === null) return Response.json(empty, { headers: NO_STORE });

  try {
    const events = await listUserEvents(userId);
    const survey = dueSurvey({ signedUpAtMs, events, nowMs: Date.now() });
    return Response.json({ available: true, survey } satisfies SurveyResponse, { headers: NO_STORE });
  } catch {
    return Response.json(empty, { headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "アンケートの保存先が未設定です（運営者にお知らせください）" }, { status: 503, headers: NO_STORE });
  }

  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "入力が正しくありません" }, { status: 422, headers: NO_STORE });

  const survey = findSurvey(parsed.data.surveyId);
  if (!survey) return Response.json({ error: "そのアンケートはありません" }, { status: 404, headers: NO_STORE });

  // 知らない設問 ID は捨て、設問ごとの上限で切る（画面を作り替えてもゴミが残らないように）
  const answers: Record<string, string> = {};
  for (const q of survey.questions.slice(0, MAX_QUESTIONS_PER_SURVEY)) {
    const value = (parsed.data.answers[q.id] ?? "").trim();
    if (value) answers[q.id] = value.slice(0, q.max);
  }

  const { lead } = await profile();
  try {
    await saveSurvey({
      userId,
      surveyId: survey.id,
      status: parsed.data.status,
      answers: parsed.data.status === "answered" ? answers : {},
      company: lead?.company ?? "",
      storeType: lead?.storeType ?? "",
    });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "保存できませんでした。時間をおいてもう一度お試しください" }, { status: 502, headers: NO_STORE });
  }
}
