import { Checker } from "@/components/free/Checker";
import { gateFreePage } from "@/lib/free/gate";

// 専用ログインの Cookie で振り分けるので、リクエストごとに判定する
export const dynamic = "force-dynamic";

/**
 * 無料診断（サイト）。専用ログイン（/free/login）の人だけが使う（利用者の決定 2026-10-02）。
 * 入れない人の行き先は src/lib/free/gate.ts。
 */
export default async function Home() {
  await gateFreePage();
  return <Checker />;
}
