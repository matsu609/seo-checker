import type { Metadata } from "next";
import { MeoChecker } from "@/components/free/MeoChecker";
import { FREE_MEO_FEATURE } from "@/lib/features/registry";
import { isIntegrationEnabled } from "@/lib/integrations";

export const metadata: Metadata = { title: FREE_MEO_FEATURE.label, description: FREE_MEO_FEATURE.description };

// Places API の有無は環境変数で決まる。静的に固めるとビルド時の値で止まるので、リクエストごとに判定する
export const dynamic = "force-dynamic";

/**
 * 無料 MEO 診断（ログイン不要。src/lib/auth/routes.ts の PUBLIC_PAGES）。
 * Places API が未設定なら画面は「準備中」を出す（環境変数名は公開ページに出さない）。
 */
export default function Page() {
  return <MeoChecker enabled={isIntegrationEnabled("places")} />;
}
