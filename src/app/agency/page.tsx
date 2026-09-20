/**
 * 旧「管理アカウント画面」（/agency）。
 *
 * 顧客の契約状況・ご利用状況は /clients（顧客管理）に 1 本化した（利用者の指示 2026-09-20。
 * 運用者と管理アカウントが同じ画面で見られるようにするため）。ブックマークや過去の案内から
 * ここに来た人を、そのまま新しい画面へ送る。
 */
import { redirect } from "next/navigation";
import { MANAGER_PATH } from "@/lib/auth/landing";

export default function Page() {
  redirect(MANAGER_PATH);
}
