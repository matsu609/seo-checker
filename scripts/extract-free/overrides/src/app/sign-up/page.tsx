import { redirect } from "next/navigation";
import { MAIN_APP_URL } from "@/lib/main-app";

export const dynamic = "force-dynamic";

/**
 * 新規登録。この切り出し版はログインを持たないので、本体サービスへ送るだけ。
 * 送り先は NEXT_PUBLIC_MAIN_APP_URL で変えられる。
 */
export default function Page() {
  redirect(`${MAIN_APP_URL}/sign-up`);
}
