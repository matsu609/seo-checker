"use client";

/**
 * 無料診断の残り回数。サーバーが描画時に渡した値から始め、診断のたびに取り直す。
 * quota が null（認証が無効な環境）なら何もしない。
 */
import { useCallback, useState } from "react";
import type { FreeQuota } from "@/lib/free/quota-rules";

export function useFreeQuota(initial: FreeQuota | null): { quota: FreeQuota | null; refresh: () => Promise<void> } {
  const [quota, setQuota] = useState<FreeQuota | null>(initial);
  const refresh = useCallback(async () => {
    if (initial === null) return;
    try {
      const res = await fetch("/api/free/quota", { cache: "no-store" });
      if (res.ok) setQuota((await res.json()) as FreeQuota);
    } catch {
      // 取れなくても表示は前の値のまま（サーバー側が正しく止める）
    }
  }, [initial]);
  return { quota, refresh };
}
