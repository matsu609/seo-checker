import type { Metadata } from "next";
import { connection } from "next/server";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui";
import { SearchPerformanceView } from "@/components/search-performance/SearchPerformanceView";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireFeature } from "@/lib/features/registry";
import { getLinkSettings } from "@/lib/google/settings";
import { getGoogleConnection } from "@/lib/google/token";

const feature = requireFeature("search-performance");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default async function Page() {
  // ログイン中のユーザーごとに内容が変わるので、ビルド時に固めない。
  // Clerk のキーが無い環境でビルドすると auth() を通らず静的化され、
  // 「未接続」の画面が焼き付いてしまう
  await connection();

  // 対象サイトはユーザーごとの連携設定から。サーバー側で解決して渡す
  const authEnabled = isAuthEnabled();
  const [googleConnection, settings] = authEnabled
    ? await Promise.all([getGoogleConnection(), getLinkSettings()])
    : [null, null];

  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      {authEnabled ? (
        <SearchPerformanceView
          connected={googleConnection?.connected ?? false}
          siteUrl={settings?.searchConsoleSiteUrl ?? null}
        />
      ) : (
        <Callout tone="warn" title="ログインが設定されていません">
          この機能は、ログインしている利用者ごとに Google アカウントを接続して使います。
          Clerk のキー（NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY と CLERK_SECRET_KEY）を設定してください。
        </Callout>
      )}
    </div>
  );
}
