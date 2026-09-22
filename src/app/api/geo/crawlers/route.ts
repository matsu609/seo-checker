/**
 * GET /api/geo/crawlers — AI クローラーの「受け入れ状態」（残タスクの ④）。
 *
 * **「来たか」ではなく「来られるか」を出す。**訪問回数はお客様のサイトの
 * アクセスログが要り、うちは 2026-09-17 の決定「お客様側の作業が要る機能は置かない」
 * と r90（自前の計測タグの取り下げ）でその線に戻らないと決めている。
 * 代わりに robots.txt を読んで、各 AI クローラーが取得を許されているかを返す。
 *
 * 判定そのものは既存の純関数（page-report/robots.ts）を使い回す。
 */
import { fetchSiteFiles } from "@/lib/analyzer/robots";
import { evaluateAiBots } from "@/lib/page-report/robots";
import { requireUser } from "@/lib/auth/guard";
import { loadSharedSettings } from "@/lib/settings/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;

  const settings = await loadSharedSettings(userId);
  const project = settings.project;
  const raw = (project?.startUrl || project?.domain || "").trim();
  if (!raw) {
    return Response.json(
      { error: "設定にホームページが登録されていません", code: "no_site" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  let origin: string;
  try {
    origin = new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return Response.json({ error: "登録されているホームページの URL を読めませんでした" }, { status: 400 });
  }

  try {
    const siteFiles = await fetchSiteFiles(origin);
    const matrix = evaluateAiBots(siteFiles.robotsTxt, `${origin}/`, `${origin}/robots.txt`);
    return Response.json(
      { origin, checkedAt: new Date().toISOString(), ...matrix },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "robots.txt を取得できませんでした" }, { status: 502 });
  }
}
