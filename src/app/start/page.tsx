import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentAgencyId, isAdmin } from "@/lib/admin/guard";
import { AGENCY_PATH, FIRST_TOOL_PATH, FREE_HOME_PATH } from "@/lib/auth/landing";
import { getCurrentPlan } from "@/lib/plans/current";

/**
 * ログイン・新規登録の直後の振り分け（画面は出さない）。
 *
 * 代理店アカウントは代理店画面へ。ツールを買う立場ではないので、
 * ここで料金プランへ送ると「払わないと何も見えない」画面に着いてしまう。
 *
 * それ以外は、未契約（無料プラン）なら無料診断（`/`。登録したメールアドレスごとに 2 回まで。
 * 利用者の決定 2026-09-18）へ、契約済みならツールへ直行する。契約済みの人には無料診断を見せない
 * （利用者の決定 2026-09-13）。行き先の定数は src/lib/auth/landing.ts。
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();
  if (await currentAgencyId()) redirect(AGENCY_PATH);
  // 運用者はプランに関係なくツールへ（無料診断は回数制限なしで別途入れる）
  if (await isAdmin()) redirect(FIRST_TOOL_PATH);
  const { plan } = await getCurrentPlan();
  redirect(plan === "free" ? FREE_HOME_PATH : FIRST_TOOL_PATH);
}
