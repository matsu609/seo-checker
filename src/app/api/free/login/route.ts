/**
 * POST /api/free/login … 無料診断の専用ログイン（利用者の決定 2026-10-02）。
 * 本文: { id, password }。合えば署名付き Cookie（src/lib/free/session-rules.ts）を置いて { ok: true } を返す。
 *
 * 総当たりを防ぐため、IP ごとに 10 分で 10 回まで（src/lib/free/ratelimit.ts。プロセス内メモリ）。
 * 失敗の理由は「ID かパスワードが違う」だけにし、どちらが違うかは返さない。
 */
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { isFreeLoginConfigured, issueFreeSession, verifyFreeLogin } from "@/lib/free/access";
import { clientKeyOf, takeClientToken } from "@/lib/free/ratelimit";

export const runtime = "nodejs";

const LOGIN_LIMIT = { windowMs: 10 * 60 * 1000, limit: 10 } as const;

const BodySchema = z.object({
  id: z.string().max(200),
  password: z.string().max(200),
});

export async function POST(request: Request) {
  if (!isFreeLoginConfigured()) {
    return Response.json({ error: "無料診断は現在ご利用いただけません。", code: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  if (!takeClientToken("free-login", clientKeyOf(request), LOGIN_LIMIT)) {
    return Response.json({ error: "試行回数が多すぎます。しばらく待ってからお試しください。", code: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "600" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "ID とパスワードを入力してください" }, { status: 400, headers: NO_STORE });
  if (!verifyFreeLogin(parsed.data.id, parsed.data.password)) {
    return Response.json({ error: "ID かパスワードが違います。", code: "invalid" }, { status: 401, headers: NO_STORE });
  }
  await issueFreeSession();
  return Response.json({ ok: true }, { headers: NO_STORE });
}
