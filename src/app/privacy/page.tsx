import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/legal/PrivacyPolicy";
import { PageHeader } from "@/components/ui";
import { SERVICE_NAME } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description: `${SERVICE_NAME} のプライバシーポリシー。取得する情報、利用目的、外部サービスへの提供、Google アカウントのデータの取り扱い、保存期間と削除について定めています。`,
};

/**
 * プライバシーポリシー。Google OAuth の審査や Clerk の設定で URL を求められるため、
 * ログイン不要（src/lib/auth/routes.ts の PUBLIC_PAGES）。本文は静的。
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <PageHeader
        title="プライバシーポリシー"
        description={`${SERVICE_NAME} が取得する情報と、その使い方・預け先・消し方を説明します。`}
      />
      <PrivacyPolicy />
    </div>
  );
}
