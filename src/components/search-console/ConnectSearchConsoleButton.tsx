"use client";

/**
 * Google 連携に「Search Console の読み取り」の権限（webmasters.readonly）を足すボタン。
 *
 * 中身は ConnectGoogleButton（口コミ返信の接続ボタンと共通。2026-09-23 にまとめた）。
 * **すでに許可されている権限（口コミ返信の business.manage など）も一緒に要求する**。
 * 足したい権限だけを要求すると、新しいトークンから既存の権限が外れ、口コミ返信が止まることがあるため。
 * Clerk が無い環境では描画しない（useUser が例外になる）。
 */
import { ConnectGoogleButton } from "@/components/replies/ConnectGoogleButton";
import { SEARCH_CONSOLE_SCOPE } from "@/lib/google/scopes";

export function ConnectSearchConsoleButton({
  grantedScopes,
  label = "Google アカウントを接続する",
  variant = "primary",
}: {
  grantedScopes: readonly string[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  // 認可が済んだらこの画面に戻す
  return <ConnectGoogleButton scope={SEARCH_CONSOLE_SCOPE} grantedScopes={grantedScopes} label={label} redirectPath="/tools/search-console" variant={variant} />;
}
