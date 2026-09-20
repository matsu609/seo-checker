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

/**
 * 複数の値のどれかに一致（`in.("a","b")`）。値が 1 件も無ければ null を返す
 * （問い合わせを組み立てず、呼び出し側で「0 件」を返すための合図）。
 *
 * PostgREST の `in` は括弧とカンマで区切り、値は二重引用符で囲む。値そのものに
 * 二重引用符やバックスラッシュが入ると囲みが壊れるので、**その形の値は捨てる**。
 * ここに渡してよいのは Clerk のユーザー ID のような短い識別子だけで、
 * 自由入力をそのまま渡さないこと。
 */
export function inList(values: readonly string[]): string | null {
  const safe = values.filter((v) => v.length > 0 && !/["\\]/.test(v));
  if (safe.length === 0) return null;
  return `in.(${safe.map((v) => encodeURIComponent(`"${v}"`)).join(",")})`;
}
