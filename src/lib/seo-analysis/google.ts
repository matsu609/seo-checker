/**
 * 事実シートの「Google 連携」の層。
 *
 * 精密診断は Google Search Console / GA4 のデータを使わない（利用者の決定 2026-09-17）ので、
 * ここは空の結果と案内文を返すだけ。Search Console の実測は 2026-09-23 に SEO の
 * 「Google サーチコンソール連携」として別画面で再開した（精密診断にはまだ取り込んでいない）。以前の取得実装（Search Console / GA4 のクライアント、
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
      notes: ["精密診断は Google Search Console / Google アナリティクスのデータを使いません。検索の実測は SEO の「Google サーチコンソール連携」、推定は「順位計測」でご覧ください"],
    },
  };
}
