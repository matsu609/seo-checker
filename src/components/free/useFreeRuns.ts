"use client";

/**
 * 今月の無料診断の回数。サーバーが描画時に渡した値から始め、診断のたびに取り直す。
 */
import { useCallback, useState } from "react";
import type { FreeRuns } from "@/lib/free/monthly-rules";

export function useFreeRuns(initial: FreeRuns): { runs: FreeRuns; refresh: () => Promise<void> } {
  const [runs, setRuns] = useState<FreeRuns>(initial);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/free/quota", { cache: "no-store" });
      if (res.ok) setRuns((await res.json()) as FreeRuns);
    } catch {
      // 取れなくても表示は前の値のまま（サーバー側が正しく止める）
    }
  }, []);
  return { runs, refresh };
}
