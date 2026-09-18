import { Checker } from "@/components/free/Checker";
import { gateFreePage } from "@/lib/free/gate";

// 登録・契約の状態で振り分けるので、リクエストごとに判定する
export const dynamic = "force-dynamic";

/**
 * 無料診断（サイト）。アカウント登録のあと、メールアドレスごとに 2 回まで（利用者の決定 2026-09-18）。
 * 未ログイン → 登録フォーム、契約済み → ツール、登録情報が無い → 補完フォーム（src/lib/free/gate.ts）。
 */
export default async function Home() {
  const { quota } = await gateFreePage("/");
  return <Checker quota={quota} />;
}
