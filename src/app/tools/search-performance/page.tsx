import { redirect } from "next/navigation";

/**
 * 旧「検索パフォーマンス」（Search Console の実測）の URL。2026-09-23 に SEO の
 * 「Google サーチコンソール連携」として作り直したので、そちらへ転送する。
 * 古いリンクとブックマークのためだけに残す。
 */
export default function Page() {
  redirect("/tools/search-console");
}
