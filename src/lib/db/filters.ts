/**
 * PostgREST のフィルタの組み立て。**ここがユーザー入力とデータベースの間の唯一の関門。**
 *
 * 問い合わせは `meo_reports?user_id=eq.<値>&order=...` のような **1 本の文字列**で、
 * 値をそのまま差し込むと `&` や `=` で別のパラメータ（`order=` `limit=` `select=`）を
 * 足せてしまう。`encodeURIComponent` はそれらをすべてエスケープするので、値は値のまま収まる。
 *
 * 2026-09-18 まで、まったく同じ実装が 8 ファイルに重複していた
 * （reviews/responses・reviews/forms・geo/store・maps/history・maps/owner-store・
 * maps/stores・listings/store・seo-analysis/runs）。安全に関わる関数が 8 か所にあると
 * 「1 か所だけ直し忘れる」が起きるので、ここに 1 つだけ置く。
 *
 * 生成する文字列を 1 文字単位で固定したテストが `__tests__/query-contract.test.ts` にある。
 */

/** 等値フィルタ（`eq.<エスケープ済みの値>`）。値は必ずこれを通してから URL に入れる */
export function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 以上フィルタ（`gte.<エスケープ済みの値>`）。日時の範囲指定に使う */
export function gte(value: string): string {
  return `gte.${encodeURIComponent(value)}`;
}

/** 未満フィルタ（`lt.<エスケープ済みの値>`）。日時の範囲の終わり（含まない）に使う */
export function lt(value: string): string {
  return `lt.${encodeURIComponent(value)}`;
}

/** 以下フィルタ（`lte.<エスケープ済みの値>`） */
export function lte(value: string): string {
  return `lte.${encodeURIComponent(value)}`;
}

/**
 * いずれかに一致（`in.("a","b")`）。空の配列は渡さない（呼び出し側で先に返す）。
 *
 * 値は二重引用符で囲む。PostgREST の in は `,` `(` `)` を区切りとして読むので、囲まないと
 * 値の中の `,` で 2 つに割れる。値の中の `"` と `\` は `\` でエスケープし、全体を
 * encodeURIComponent に通す（`&` や `=` で別のパラメータを足せないようにする）。
 * 2026-09-23 に追加。それまでは `lt.` / `lte.` / `in.(…)` を各所で手書きしていた。
 */
export function inList(values: readonly string[]): string {
  const quoted = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
  return `in.${encodeURIComponent(`(${quoted})`)}`;
}

/** いずれにも一致しない（`not.in.("a","b")`）。空の配列は渡さない */
export function notInList(values: readonly string[]): string {
  return `not.${inList(values)}`;
}
