import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { claimAgencyInvitation } from "@/lib/admin/agencies";
import { currentAgencyId, isAdmin } from "@/lib/admin/guard";
import { FIRST_TOOL_PATH, FREE_HOME_PATH, MANAGER_PATH } from "@/lib/auth/landing";
import { getCurrentPlan } from "@/lib/plans/current";

/**
 * ログイン・新規登録の直後の振り分け（画面は出さない）。
 *
 * 管理アカウントは顧客管理の画面へ。ツールを買う立場ではないので、
 * ここで料金プランへ送ると「払わないと何も見えない」画面に着いてしまう
 * （ツール自体は r132 から全部使える。利用者の決定 2026-09-20）。
 *
 * それ以外は、未契約（無料プラン）なら無料診断（`/`。登録したメールアドレスごとに 2 回まで。
 * 利用者の決定 2026-09-18）へ、契約済みならツールへ直行する。契約済みの人には無料診断を見せない
 * （利用者の決定 2026-09-13）。行き先の定数は src/lib/auth/landing.ts。
 *
 * ここで招待の取りこぼしも拾う（r137。利用者の報告 2026-09-21）。招待メールのリンクは Clerk の
 * 招待フロー（チケット）を通る前提だが、このアプリの登録フォームは自前でチケットを扱わないため、
 * 招待された人がふつうに登録すると管理アカウントの印が付かず、お客様として料金プランに送られてしまう。
 * 登録直後もログインのたびもここを通るので、拾う場所としてはここが確実。
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();
  if (await currentAgencyId()) redirect(MANAGER_PATH);
  // 運用者はプランに関係なくツールへ（無料診断は回数制限なしで別途入れる）
  if (await isAdmin()) redirect(FIRST_TOOL_PATH);

  // まだ管理アカウントではない人だけ、自分あての招待が残っていないかを見る。
  // 失敗しても振り分けは止めない（ログインできないほうが困る）
  const { userId } = await auth();
  let claimed = false;
  if (userId) {
    try {
      claimed = await claimAgencyInvitation(userId);
    } catch {
      // 拾えなくても登録は成立している。運用者がマスター画面から追加し直せる
    }
  }
  // redirect() は例外で抜けるので、必ず try の外で呼ぶ（中だと catch が飲み込んでしまう）
  if (claimed) redirect(MANAGER_PATH);

  const { plan } = await getCurrentPlan();
  redirect(plan === "free" ? FREE_HOME_PATH : FIRST_TOOL_PATH);
}
