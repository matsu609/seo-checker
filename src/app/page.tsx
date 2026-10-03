import { Checker } from "@/components/free/Checker";
import { gateFreePage } from "@/lib/free/gate";

// 固定リンクの Cookie で振り分け、今月の回数も出すので、リクエストごとに判定する
export const dynamic = "force-dynamic";

/**
 * 無料診断（サイト）。固定リンク（/free）を開いた人だけが使う（利用者の決定 2026-10-02）。
 * 入れない人の行き先は src/lib/free/gate.ts。
 */
export default async function Home() {
  const { runs } = await gateFreePage();
  return <Checker runs={runs} />;
}
