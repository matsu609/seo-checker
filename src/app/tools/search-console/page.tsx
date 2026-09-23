import type { Metadata } from "next";
import { connection } from "next/server";
import { PlanGate } from "@/components/plans/PlanGate";
import { SearchConsoleTool } from "@/components/search-console/SearchConsoleTool";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireFeature } from "@/lib/features/registry";
import { loadSearchConsoleStatus } from "@/lib/google/search-console/status";

const feature = requireFeature("search-console");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default async function Page() {
  // ログイン中の利用者ごとに内容が変わるので、ビルド時に固めない
  // （Clerk のキーが無い環境でビルドすると「未接続」の画面が焼き付いてしまう）
  await connection();
  const status = isAuthEnabled() ? await loadSearchConsoleStatus() : null;

  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="search-console">
        {status ? (
          <SearchConsoleTool status={status} />
        ) : (
          <Callout tone="warn" title="ログインが設定されていません">
            この機能は、ログインしている利用者ごとに Google アカウントを接続して使います。Clerk のキー（NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY と CLERK_SECRET_KEY）を設定してください。
          </Callout>
        )}
      </PlanGate>
    </div>
  );
}
