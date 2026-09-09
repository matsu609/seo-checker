/**
 * 機能の個別開放（プランとは別に、運用者が顧客ごとに開ける）。純粋関数だけを置く。
 *
 * 保存先は Clerk の publicMetadata.featureOverrides（機能 ID の配列）。
 * publicMetadata にしているのは、サイドバーの鍵表示がクライアント側で必要になるため。
 * 秘密の情報ではなく、「この人はこの機能を使える」という事実だけを持つ。
 *
 * 開放だけで、剥奪はしない。プランで使える機能をここで塞げると、
 * 「払っているのに使えない」が作れてしまい、事故のほうが高くつく。
 */
import { findFeatureById } from "@/lib/features/registry";

export const OVERRIDES_KEY = "featureOverrides";

/**
 * 任意の値を機能 ID の配列にする。壊れていれば空。
 * レジストリに無い ID は捨てる（消した機能の ID が残り続けないように）。
 */
export function parseFeatureOverrides(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((v): v is string => typeof v === "string" && findFeatureById(v) !== null);
  return [...new Set(ids)].sort();
}

/** publicMetadata から取り出す */
export function overridesFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  return parseFeatureOverrides((metadata as Record<string, unknown>)[OVERRIDES_KEY]);
}

/** 1 件の追加・削除（保存する値を作る。純粋） */
export function toggleOverride(current: readonly string[], featureId: string, enabled: boolean): string[] {
  const next = new Set(current);
  if (enabled) next.add(featureId);
  else next.delete(featureId);
  return parseFeatureOverrides([...next]);
}
