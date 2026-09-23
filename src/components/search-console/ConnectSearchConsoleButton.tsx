"use client";

/**
 * Google 連携に「Search Console の読み取り」の権限（webmasters.readonly）を足すボタン。
 *
 * Clerk の外部アカウント連携を使う。既に Google がつながっていれば reauthorize で
 * 権限を足し、無ければ新規に接続する。**すでに許可されている権限（口コミ返信の
 * business.manage など）も一緒に要求する**。足したい権限だけを要求すると、
 * 新しいトークンから既存の権限が外れ、口コミ返信が止まることがあるため。
 * Clerk が無い環境では描画しない（useUser が例外になる）。
 */
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
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
  const { isLoaded, user } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const params = {
        additionalScopes: [...new Set([...grantedScopes, SEARCH_CONSOLE_SCOPE])],
        // 認可が済んだらこの画面に戻す
        redirectUrl: `${window.location.origin}/tools/search-console`,
      };
      // ログインの「Google で続ける」で先に Google がつながっていると、同じプロバイダを
      // 二重には作れない。その場合は既存の接続に権限を足す形（reauthorize）で認可画面へ送る
      const existing = user.externalAccounts.find((a) => a.provider.includes("google"));
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
