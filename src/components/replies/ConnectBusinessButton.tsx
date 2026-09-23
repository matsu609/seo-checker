"use client";

/**
 * Google 連携に「口コミ返信・インサイト」の権限（business.manage）を足すボタン。
 *
 * 中身は ConnectGoogleButton（サーチコンソールの接続ボタンと共通）。すでに許可されている権限
 * （サーチコンソールの webmasters.readonly など）も一緒に要求する。2026-09-23 まではこのスコープだけを
 * 要求していたため、口コミ返信の権限を足すとサーチコンソールの権限が外れることがあった
 * （「Search Console は使わない（09-17）」の前提は 09-23 のサーチコンソール連携の再開で崩れていた）。
 * Clerk が無い環境では描画しない（useUser が例外になる）。
 */
import { BUSINESS_PROFILE_SCOPE } from "@/lib/google/scopes";
import { ConnectGoogleButton } from "./ConnectGoogleButton";

export function ConnectBusinessButton({
  label = "Google に口コミ返信の権限を追加する",
  grantedScopes,
}: {
  label?: string;
  /** サーバーが返した付与済みのスコープ（無ければブラウザ側の Clerk の値だけで補う） */
  grantedScopes?: readonly string[];
}) {
  return <ConnectGoogleButton scope={BUSINESS_PROFILE_SCOPE} grantedScopes={grantedScopes} label={label} redirectPath="/sso-callback" />;
}
