"use client";

/**
 * 設定画面の「Google 連携」（操作側）。
 *
 * 状態はサーバーコンポーネント（GoogleLinkSection）が渡す。ここは接続と保存だけを
 * 行い、保存後は router.refresh() でサーバー側を取り直す。
 *
 * 接続は Clerk の外部アカウント連携を使う。必要なスコープは additionalScopes で
 * その場で要求するので、Clerk のダッシュボードでスコープを足す必要はない
 * （Google Cloud 側で API を有効にしておくことは必要）。
 */
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { isUnverifiedSite } from "@/lib/google/search-console/parse";
import { ANALYTICS_SCOPE, SEARCH_CONSOLE_SCOPE } from "@/lib/google/scopes";
import { needsGoogleSetup, usableSites } from "@/lib/google/setup";
import type { GoogleStatus } from "@/lib/google/status";
import { GoogleSetupGuide } from "./GoogleSetupGuide";

const UNSELECTED = "";

export function GoogleLinkPanel({ status }: { status: GoogleStatus }) {
  const { isLoaded, user } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** Google の認可画面へ送る。戻り先は /sso-callback → 設定画面 */
  async function connect() {
    if (!user) return;
    setError(null);
    try {
      const account = await user.createExternalAccount({
        strategy: "oauth_google",
        additionalScopes: [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE],
        redirectUrl: `${window.location.origin}/sso-callback`,
      });
      const url = account.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error("Google の認可画面を開けませんでした");
      window.location.href = url.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google に接続できませんでした");
    }
  }

  async function save(patch: { searchConsoleSiteUrl?: string | null; ga4PropertyId?: string | null }) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/google/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      setSaved(true);
      // サーバー側の状態（選択中の値・一覧）を取り直す
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  /** Google 側で設定を済ませたあと、一覧だけ取り直す */
  function refresh() {
    setError(null);
    startTransition(() => router.refresh());
  }

  const busy = saving || pending || !isLoaded;
  const missing = status.missingScopes;

  // 所有権が未確認のサイトは選ばせない（選んでも取得が 403 で落ちるだけ）。
  // 空の理由が「Google 側の設定がまだ」のときだけ手順を出す（判定は setup.ts）。
  const selectableSites = usableSites(status.sites);
  const needsSearchConsoleSetup = needsGoogleSetup(status, "search-console");
  const needsAnalyticsSetup = needsGoogleSetup(status, "analytics");

  return (
    <Card
      title="Google 連携"
      description="Search Console と Google アナリティクス（GA4）を、ログインしているアカウントごとに接続します。選んだ内容はこのアカウントにだけ適用され、他の利用者からは見えません。"
    >
      {error && (
        <Callout tone="fail" title="エラー" className="mb-4">
          {error}
        </Callout>
      )}

      {!status.connected ? (
        <div className="space-y-3">
          <Callout tone="info" title="まだ接続されていません">
            <p>
              Google アカウントを接続すると、そのアカウントで見られる Search Console のサイトと GA4
              のプロパティを選べるようになります。要求するのは読み取り専用の権限だけです。
            </p>
          </Callout>
          <Button onClick={() => void connect()} disabled={!isLoaded}>
            Google アカウントを接続する
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink">
            接続中: <span className="font-bold break-all">{status.email ?? "Google アカウント"}</span>
          </p>

          {missing.length > 0 && (
            <Callout tone="warn" title="権限が足りません">
              <p>読み取りの許可が一部ありません。接続し直して、権限の確認画面ですべて許可してください。</p>
              <ul className="mt-1 list-disc pl-5 text-[13px]">
                {missing.includes(SEARCH_CONSOLE_SCOPE) && <li>Search Console の読み取り</li>}
                {missing.includes(ANALYTICS_SCOPE) && <li>Google アナリティクスの読み取り</li>}
              </ul>
              <Button size="sm" className="mt-2" onClick={() => void connect()} disabled={!isLoaded}>
                接続し直す
              </Button>
            </Callout>
          )}

          {status.errors.searchConsole && (
            <Callout tone="warn" title="Search Console の一覧を取得できませんでした">
              {status.errors.searchConsole}
            </Callout>
          )}
          {needsSearchConsoleSetup ? (
            <GoogleSetupGuide service="search-console" onRefresh={refresh} refreshing={pending} />
          ) : (
            <Field
              label="Search Console のサイト"
              hint="検索パフォーマンス画面で見る対象です。所有権が確認済みのサイトだけが並びます。"
            >
              <Select
                value={status.settings.searchConsoleSiteUrl ?? UNSELECTED}
                disabled={busy || selectableSites.length === 0}
                onChange={(e) => void save({ searchConsoleSiteUrl: e.target.value || null })}
              >
                <option value={UNSELECTED}>選択しない</option>
                {status.sites.map((s) => (
                  <option key={s.siteUrl} value={s.siteUrl} disabled={isUnverifiedSite(s)}>
                    {s.label}
                    {isUnverifiedSite(s) && "（所有権が未確認）"}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {status.errors.analytics && (
            <Callout tone="warn" title="GA4 のプロパティ一覧を取得できませんでした">
              {status.errors.analytics}
            </Callout>
          )}
          {needsAnalyticsSetup ? (
            <GoogleSetupGuide service="analytics" onRefresh={refresh} refreshing={pending} />
          ) : (
            <Field
              label="GA4 のプロパティ"
              hint="生成 AI 流入分析とサイトレポートで使います。選ばない場合は、サーバーに設定されたプロパティ（全体共通）を使います。"
            >
              <Select
                value={status.settings.ga4PropertyId ?? UNSELECTED}
                disabled={busy || status.properties.length === 0}
                onChange={(e) => void save({ ga4PropertyId: e.target.value || null })}
              >
                <option value={UNSELECTED}>選択しない（サーバーの設定を使う）</option>
                {status.properties.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.accountName ? `${p.accountName} / ` : ""}
                    {p.displayName}（{p.propertyId}）
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {saved && !busy && <p className="text-[13px] text-pass">保存しました。</p>}
        </div>
      )}
    </Card>
  );
}
