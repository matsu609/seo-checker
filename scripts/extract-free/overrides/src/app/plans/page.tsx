import { redirect } from "next/navigation";
import { MAIN_APP_URL } from "@/lib/main-app";

export const dynamic = "force-dynamic";

/**
 * 料金プラン。この切り出し版には有料機能が無いので、本体サービスへ送るだけ。
 * 無料 MEO 診断の画面（MeoChecker）が「料金プランを見る」で /plans を指しているため、
 * リンク切れにしないように置いている。送り先は NEXT_PUBLIC_MAIN_APP_URL で変えられる。
 */
export default function Page() {
  redirect(`${MAIN_APP_URL}/plans`);
}
