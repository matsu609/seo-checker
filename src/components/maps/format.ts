/** Google マップ画面の表示用の小さな整形（純粋関数） */
import type { BusinessStatus } from "@/lib/maps/types";

export function formatRating(rating: number | null): string {
  return rating === null ? "—" : rating.toFixed(1);
}

export function formatCount(count: number | null): string {
  return count === null ? "—" : count.toLocaleString("ja-JP");
}

export function statusLabel(status: BusinessStatus): string {
  switch (status) {
    case "OPERATIONAL":
      return "営業中";
    case "CLOSED_TEMPORARILY":
      return "臨時休業";
    case "CLOSED_PERMANENTLY":
      return "閉業";
    default:
      return "不明";
  }
}

/** URL からホスト名だけを出す（表で長い URL を出さないため） */
export function hostOf(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
