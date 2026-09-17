import type { Metadata } from "next";
import { requireFeature } from "@/lib/features/registry";
import { SettingsView } from "./SettingsView";

const feature = requireFeature("settings");

export const metadata: Metadata = { title: feature.label, description: feature.description };

/**
 * Google 連携（Search Console / GA4）のカードは 2026-09-17 に外した（利用者の決定:
 * Google の無料ツールは使わず、検索は「検索パフォーマンス（推定）」、サイト内の行動は
 * 自前の「計測タグ」で取る）。口コミ返信に要る Google ビジネス プロフィールの権限は、
 * 口コミ返信の画面から個別に追加する。
 */
export default function Page() {
  return <SettingsView />;
}
