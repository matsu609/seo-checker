import type { Metadata } from "next";
import { TermsOfService } from "@/components/legal/TermsOfService";
import { PageHeader } from "@/components/ui";
import { SERVICE_NAME } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "利用規約",
  description: `${SERVICE_NAME} の利用規約。アカウント、料金、診断結果の取り扱い、外部サービスとの連携、免責と責任の範囲について定めています。`,
};

/**
 * 利用規約。登録前に読めるよう、ログイン不要（src/lib/auth/routes.ts の PUBLIC_PAGES）。
 * 本文は静的なので、ビルド時に固めてよい。
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <PageHeader
        title="利用規約"
        description={`${SERVICE_NAME} をお使いいただくうえでの約束事です。アカウントを登録した時点、または無料診断を利用した時点で、この規約に同意したものとして扱います。`}
      />
      <TermsOfService />
    </div>
  );
}
