"use client";

/**
 * Google 連携に API の権限（スコープ）を 1 つ足すボタン。口コミ返信（ConnectBusinessButton）と
 * サーチコンソール（ConnectSearchConsoleButton）の共通部分（2026-09-23 に 2 つの実装をまとめた）。
 *
 * Clerk の外部アカウント連携を使う。既に Google がつながっていれば reauthorize で
 * 権限を足し、無ければ新規に接続する。**すでに許可されている権限も一緒に要求する**
 * （scopesToRequest）。足したい権限だけを要求すると、新しいトークンから既存の権限が外れ、
 * 口コミ返信やサーチコンソールが止まることがあるため。以前は口コミ返信のボタンだけがこれをしていなかった。
 * Clerk が無い環境では描画しない（useUser が例外になる）。
 */
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { scopesToRequest } from "@/lib/google/scopes";

export interface ConnectGoogleButtonProps {
  /** 足したいスコープ */
  scope: string;
  /** サーバーが返した付与済みのスコープ（無ければブラウザ側の Clerk の値だけで補う） */
  grantedScopes?: readonly string[];
  label: string;
  /** 認可が済んだあとに戻す画面のパス */
  redirectPath: string;
  variant?: "primary" | "secondary";
}

export function ConnectGoogleButton({ scope, grantedScopes = [], label, redirectPath, variant }: ConnectGoogleButtonProps) {
  const { isLoaded, user } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      // ログインの「Google で続ける」で先に Google がつながっていると、同じプロバイダを
      // 二重には作れない。その場合は既存の接続に権限を足す形（reauthorize）で認可画面へ送る
      const existing = user.externalAccounts.find((a) => a.provider.includes("google"));
      const params = {
        additionalScopes: scopesToRequest(scope, grantedScopes, existing?.approvedScopes ?? ""),
        redirectUrl: `${window.location.origin}${redirectPath}`,
      };
      const account = existing ? await existing.reauthorize(params) : await user.createExternalAccount({ strategy: "oauth_google", ...params });
      const url = account.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error("Google の認可画面を開けませんでした");
      window.location.href = url.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google に接続できませんでした");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant={variant} onClick={() => void connect()} disabled={!isLoaded || busy} loading={busy}>
        {label}
      </Button>
      {error && (
        <p className="mt-2 text-[12px] text-fail" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
