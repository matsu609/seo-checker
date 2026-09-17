import { redirect } from "next/navigation";

/**
 * AIO 頻出トピック（A5）はサイドバーから外した（利用者の指示 2026-09-17「本当に必要な機能に絞る」）。
 * 「AI が自社について何を語っているか」は AI 検索モニタリングが引用・参照として毎週はかる。
 * 古いリンクとブックマークのために転送だけ残す。API（/api/aio-topics）はそのまま。
 */
export default function Page() {
  redirect("/tools/geo");
}
