import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GoogleLinkSection } from "@/components/google/GoogleLinkSection";
import { Card } from "@/components/ui/Card";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireFeature } from "@/lib/features/registry";
import { SettingsView } from "./SettingsView";

const feature = requireFeature("settings");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default async function Page() {
  // ログイン中のユーザーごとに Google 連携の状態が変わるので、ビルド時に固めない
  await connection();

  // Clerk が未設定なら ClerkProvider が無く、Google 連携の部品が使う useUser() が
  // 例外になる。サーバー側で判定して、そのときはカードごと出さない。
  // Google の API が遅くても設定画面の他が待たされないよう Suspense で包む。
  const googleSection = isAuthEnabled() ? (
    <Suspense fallback={<Card title="Google 連携" description="読み込んでいます…" />}>
      <GoogleLinkSection />
    </Suspense>
  ) : null;

  return <SettingsView googleSection={googleSection} />;
}
