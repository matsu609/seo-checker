/** Google 連携の失敗。画面にそのまま出せる日本語のメッセージを持つ */
export class GoogleLinkError extends Error {
  constructor(
    message: string,
    public readonly code:
      /** ログインしていない */
      | "unauthenticated"
      /** Google アカウントを接続していない */
      | "not_connected"
      /** 接続はあるがスコープが足りない */
      | "insufficient_scope"
      /** 連携するサイト / プロパティを選んでいない */
      | "not_selected"
      /** Google 側が拒否した（権限・無効なプロパティなど） */
      | "forbidden"
      /** 呼び出し回数の上限 */
      | "rate_limited"
      /** 通信・タイムアウト・想定外の応答 */
      | "network",
  ) {
    super(message);
    this.name = "GoogleLinkError";
  }
}

/** Google API の HTTP ステータスを、画面に出せるエラーに変える */
export function mapGoogleHttpError(status: number, service: string): GoogleLinkError {
  if (status === 401) {
    return new GoogleLinkError(
      `${service} の認証が切れました。設定画面で Google アカウントを接続し直してください。`,
      "not_connected",
    );
  }
  if (status === 403) {
    return new GoogleLinkError(
      `${service} へのアクセスが拒否されました。そのアカウントに閲覧権限があるかご確認ください。`,
      "forbidden",
    );
  }
  if (status === 429) {
    return new GoogleLinkError(
      `${service} の呼び出し上限に達しました。時間をおいて再度お試しください。`,
      "rate_limited",
    );
  }
  return new GoogleLinkError(`${service} の取得に失敗しました（HTTP ${status}）`, "network");
}

/** GoogleLinkError の code → HTTP ステータス */
export function statusOf(code: GoogleLinkError["code"]): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "rate_limited":
      return 429;
    case "network":
      return 502;
    // 接続していない・スコープ不足・未選択は、いずれも利用者の設定待ち。
    // 画面が code で分岐して「設定画面へ」の案内を出す
    case "not_connected":
    case "insufficient_scope":
    case "not_selected":
      return 409;
  }
}

/** API ルートから返す共通のエラー応答 */
export function googleErrorResponse(err: unknown): Response {
  if (err instanceof GoogleLinkError) {
    return Response.json(
      { error: err.message, code: err.code },
      { status: statusOf(err.code), headers: { "cache-control": "no-store" } },
    );
  }
  console.error("[google] unexpected error", err);
  return Response.json(
    { error: "Google との連携で予期しないエラーが発生しました。", code: "network" },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}
