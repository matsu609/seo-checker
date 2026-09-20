"use client";

/**
 * マスター画面の「管理アカウント」カードの入れ物。
 *
 * AgencyCard は追加・解除のたびに新しい一覧を返すので、それを持つだけの薄い層。
 * 顧客一覧（担当の割り当て）は別の画面（/clients）に移したので、ここでは一覧を
 * 共有する相手がいない（以前の AdminConsole の役目はこれだけになった）。
 */
import { useState } from "react";
import type { AgencyRow } from "@/lib/admin/agencies";
import { AgencyCard } from "./AgencyCard";

export function AgencyPanel({ initial }: { initial: AgencyRow[] }) {
  const [agencies, setAgencies] = useState(initial);
  return <AgencyCard agencies={agencies} onChange={setAgencies} />;
}
