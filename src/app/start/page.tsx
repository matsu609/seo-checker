import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentAgencyId } from "@/lib/admin/guard";
import { getCurrentPlan } from "@/lib/plans/current";

/**
 * ログイン・新規登録の直後の振り分け（画面は出さない）。
 *
 * 代理店アカウントは代理店画面へ。ツールを買う立場ではないので、
 * ここで料金プランへ送ると「払わないと何も見えない」画面に着いてしまう。
 *
 * それ以外は、未契約（無料プラン）なら料金プランへ送って先にカードを登録してもらい、
 * 契約済みならツールへ直行する。無料診断（`/` と `/meo`）はログイン不要で公開しているので、
 * ログイン後に無料で触れる範囲をもう一度用意する必要がない（利用者の決定 2026-09-13）。
 */
export const dynamic = "force-dynamic";

/** 契約済みの人が最初に着く画面 */
export const FIRST_TOOL_PATH = "/tools/seo-analysis";

/** 代理店が最初に着く画面 */
export const AGENCY_PATH = "/agency";

export default async function Page() {
  await connection();
  if (await currentAgencyId()) redirect(AGENCY_PATH);
  const { plan } = await getCurrentPlan();
  redirect(plan === "free" ? "/plans" : FIRST_TOOL_PATH);
}
