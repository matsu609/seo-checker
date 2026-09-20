/**
 * /api/feedback … ご意見・不具合の報告（ログイン必須）。
 *
 *   GET  → { items }  自分が送ったものと運営者の返答（新しい順、最大 50 件）。設定画面の「ご意見の履歴」
 *   POST → { item }   送る。本文: { kind, body, path? }
 *
 * 誰が・どの画面で・どの版で、はサーバーが付ける（メール・表示名は Clerk、プランは判定結果、
 * ブラウザは User-Agent ヘッダ、版は動いているコミットとリリース番号）。ブラウザから
 * 送られるのは種類・本文・開いていた画面のパスだけ。
 *
 * 代理ログイン中は送れない（お客様の名前で記録が残るため。決済 API と同じ扱い）。
 */
import { currentUser } from "@clerk/nextjs/server";
import { NO_STORE } from "@/lib/api/headers";
import { isImpersonating } from "@/lib/admin/impersonate";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse } from "@/lib/db/supabase";
import { createFeedback, listOwnFeedback } from "@/lib/feedback/store";
import { FEEDBACK_DAILY_LIMIT, FeedbackInputSchema } from "@/lib/feedback/types";
import { takeClientToken } from "@/lib/free/ratelimit";
import { leadFromMetadata } from "@/lib/free/lead";
import { getCurrentPlan } from "@/lib/plans/current";
import { buildInfo } from "@/lib/release/build";
import { releaseCount } from "@/lib/release/catalog";

export const runtime = "nodejs";
export const maxDuration = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const userId = await requireUser({ headers: NO_STORE });
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ items: await listOwnFeedback(userId) }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

/** 送信者のメールと表示名（会社名 → 担当者名 → 氏名の順。認証なしの環境では空） */
async function senderProfile(): Promise<{ email: string; name: string }> {
  if (!isAuthEnabled()) return { email: "", name: "" };
  try {
    const user = await currentUser();
    if (!user) return { email: "", name: "" };
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
    const lead = leadFromMetadata(user.publicMetadata, user.unsafeMetadata);
    const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ");
    return {
      email: primary?.emailAddress ?? "",
      name: lead?.company.trim() || lead?.contactName.trim() || fullName || user.username || "",
    };
  } catch {
    return { email: "", name: "" };
  }
}

export async function POST(request: Request) {
  const userId = await requireUser({ headers: NO_STORE });
  if (userId instanceof Response) return userId;
  if (isAuthEnabled() && (await isImpersonating())) {
    return Response.json(
      { error: "代理ログイン中はご意見を送れません（お客様の名前で記録が残るため）。ご自身のアカウントに戻ってから送ってください。", code: "impersonating" },
      { status: 403, headers: NO_STORE },
    );
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = FeedbackInputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  if (!takeClientToken("feedback", userId, { windowMs: DAY_MS, limit: FEEDBACK_DAILY_LIMIT })) {
    return Response.json({ error: "本日の送信回数の上限に達しました。明日またお送りください。", code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  try {
    const [{ email, name }, { plan }] = await Promise.all([senderProfile(), getCurrentPlan()]);
    const item = await createFeedback({
      userId,
      email,
      name,
      kind: parsed.data.kind,
      body: parsed.data.body,
      // ブラウザが付けた値。空や相対でないものは捨てる（一覧に出すだけなので厳密でなくてよい）
      path: parsed.data.path && parsed.data.path.startsWith("/") ? parsed.data.path : "",
      plan,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 400),
      commit: buildInfo().commit ?? "",
      release: releaseCount(),
    });
    return Response.json({ item }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
