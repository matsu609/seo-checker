/**
 * /api/karte … お客様カルテ（ログイン必須・本人の分だけ）。
 *
 *   GET → { available, questions, answers, progress, updatedAt }
 *   PUT → 保存（区切りごとに、いまの全答えを丸ごと送る）
 *
 * 設問はログイン中の本人の業種で決まる（業種が未設定なら共通の設問だけ）。
 * Supabase が未設定・テーブルが無いときは `available: false` を返し、画面が案内を出す。
 */
import { currentUser } from "@clerk/nextjs/server";
import { NO_STORE } from "@/lib/api/headers";
import { readJson } from "@/lib/api/request";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { leadFromMetadata, type LeadProfile } from "@/lib/free/lead";
import { questionsFor, type KarteQuestion } from "@/lib/karte/questions";
import { forgetKarteBrief } from "@/lib/karte/server";
import { getKarte, saveKarte } from "@/lib/karte/store";
import { KarteAnswersSchema, karteProgress, type KarteAnswers, type KarteProgress } from "@/lib/karte/types";

export const runtime = "nodejs";

export interface KarteResponse {
  /** 保存先が使えるか（false なら画面は記入させない） */
  available: boolean;
  questions: KarteQuestion[];
  answers: KarteAnswers;
  progress: KarteProgress;
  updatedAt: string | null;
  /** 業種（未設定なら空。画面が「設定で業種を選ぶと設問が増えます」と案内する） */
  storeType: string;
}

async function lead(): Promise<LeadProfile | null> {
  if (!isAuthEnabled()) return null;
  try {
    const user = await currentUser();
    return user ? leadFromMetadata(user.publicMetadata, user.unsafeMetadata) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const profile = await lead();
  const questions = [...questionsFor(profile?.storeType ?? null)];
  if (!isSupabaseConfigured()) {
    const body: KarteResponse = {
      available: false,
      questions,
      answers: {},
      progress: { answered: 0, total: questions.length, percent: 0 },
      updatedAt: null,
      storeType: profile?.storeType ?? "",
    };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const record = await getKarte(userId);
    const body: KarteResponse = {
      available: true,
      questions,
      answers: record.answers,
      progress: karteProgress(record.answers, profile?.storeType ?? null),
      updatedAt: record.updatedAt,
      storeType: profile?.storeType ?? "",
    };
    return Response.json(body, { headers: NO_STORE });
  } catch {
    const body: KarteResponse = {
      available: false,
      questions,
      answers: {},
      progress: { answered: 0, total: questions.length, percent: 0 },
      updatedAt: null,
      storeType: profile?.storeType ?? "",
    };
    return Response.json(body, { headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "カルテの保存先が未設定です（運営者にお知らせください）" }, { status: 503, headers: NO_STORE });
  }

  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = KarteAnswersSchema.safeParse((raw as { answers?: unknown } | null)?.answers);
  if (!parsed.success) {
    return Response.json({ error: "入力が正しくありません" }, { status: 422, headers: NO_STORE });
  }

  const profile = await lead();
  try {
    const record = await saveKarte({
      userId,
      answers: parsed.data,
      company: profile?.company ?? "",
      storeType: profile?.storeType ?? "",
    });
    // 次に AI が文章を書くときから、新しい答えを使わせる
    forgetKarteBrief(userId);
    const body: KarteResponse = {
      available: true,
      questions: [...questionsFor(profile?.storeType ?? null)],
      answers: record.answers,
      progress: karteProgress(record.answers, profile?.storeType ?? null),
      updatedAt: record.updatedAt,
      storeType: profile?.storeType ?? "",
    };
    return Response.json(body, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "保存できませんでした。時間をおいてもう一度お試しください" }, { status: 502, headers: NO_STORE });
  }
}
