import type { Metadata } from "next";
import { MeoChecker } from "@/components/free/MeoChecker";
import { FREE_MEO_FEATURE } from "@/lib/features/registry";
import { gateFreePage } from "@/lib/free/gate";
import { isIntegrationEnabled } from "@/lib/integrations";

export const metadata: Metadata = { title: FREE_MEO_FEATURE.label, description: FREE_MEO_FEATURE.description };

// Places API の有無は環境変数で決まり、登録・契約の状態でも振り分けるので、リクエストごとに判定する
export const dynamic = "force-dynamic";

/**
 * 無料 MEO 診断。アカウント登録のあと、メールアドレスごとに 2 回まで（サイト診断と合計。利用者の決定 2026-09-18）。
 * Places API が未設定なら画面は「準備中」を出す（環境変数名は公開ページに出さない）。
 */
export default async function Page() {
  const { quota } = await gateFreePage("/meo");
  return <MeoChecker enabled={isIntegrationEnabled("places")} quota={quota} />;
}
