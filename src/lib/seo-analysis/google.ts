/**
 * 事実シートの「Google 連携」の層。
 *
 * 本サービスは Google Search Console / GA4 を使わない（利用者の決定 2026-09-17）ので、
 * ここは空の結果と案内文を返すだけ。以前の取得実装（Search Console / GA4 のクライアント、
 * 数字の診断ルール）は 2026-09-17 に削除した。
 */
import type { SheetGoogle } from "./sheet/types";

export interface CollectGoogleOutcome {
  google: SheetGoogle;
}

export function unusedGoogleOutcome(): CollectGoogleOutcome {
  return {
    google: {
      searchConsole: null,
      ga4: null,
      notes: ["本サービスは Google Search Console / Google アナリティクスを使いません。検索の状況は「検索パフォーマンス（推定）」でご覧ください"],
    },
  };
}
