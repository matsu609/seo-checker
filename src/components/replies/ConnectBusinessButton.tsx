"use client";

/**
 * Google 連携に「口コミ返信」の権限（business.manage）を足すボタン。
 *
 * 設定画面の GoogleLinkPanel と同じ仕組み（Clerk の外部アカウント連携）。既に Google が
 * つながっていれば reauthorize で権限だけ足し、無ければ新規に接続する。
 * 読み取りの 2 つも一緒に要求する（付与済みのスコープが落ちないように）。
 * Clerk が無い環境では描画しない（useUser が例外になる）。
 */
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ANALYTICS_SCOPE, BUSINESS_PROFILE_SCOPE, SEARCH_CONSOLE_SCOPE } from "@/lib/google/scopes";

export function ConnectBusinessButton({ label = "Google に口コミ返信の権限を追加する" }: { label?: string }) {
  const { isLoaded, user } = useUser();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const params = {
        additionalScopes: [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE, BUSINESS_PROFILE_SCOPE],
        redirectUrl: `${window.location.origin}/sso-callback`,
      };
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
      <Button type="button" onClick={() => void connect()} disabled={!isLoaded || busy} loading={busy}>
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
