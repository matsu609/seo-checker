/**
 * API の入口で使うリクエストの読み取りと、よく使う応答。
 *
 * 2026-09-18 まで、同じ実装が reviews/api.ts と listings/api.ts の 2 か所にあった。
 * 応答の文面と状態コードは当時のまま（外から見える動作なので変えない）。
 */

/** JSON 本文。読めなければ 400 の Response */
export async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
}

/** 入力が正しくないときの 400 */
export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
