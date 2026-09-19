import { redirect } from "next/navigation";

/** 2026-09-19「順位計測」のタブに統合。古いリンクとブックマークのために転送だけ残す */
export default function Page() {
  redirect("/tools/rank");
}
