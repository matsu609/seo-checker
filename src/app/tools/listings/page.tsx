import { redirect } from "next/navigation";

/** 2026-09-19「掲載」（サイテーション）に統合。古いリンクとブックマークのために転送だけ残す */
export default function Page() {
  redirect("/tools/citations");
}
