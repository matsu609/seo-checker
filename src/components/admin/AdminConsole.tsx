"use client";

/**
 * マスター画面の操作部分（代理店 + 顧客一覧）。
 *
 * 代理店を足す・外すと、顧客一覧の「担当代理店」の選択肢も変わる。
 * 2 つのカードが同じ一覧を見ている必要があるので、状態をここ 1 か所に置く。
 */
import { useState } from "react";
import type { AgencyRow } from "@/lib/admin/agencies";
import type { ClientRow } from "@/lib/admin/clients";
import { AgencyCard } from "./AgencyCard";
import { ClientTable } from "./ClientTable";

export interface AdminConsoleProps {
  agencies: AgencyRow[];
  clients: ClientRow[];
  /** 無料診断の上限（回数の表示に使う） */
  freeRunLimit?: number;
  totalCount: number;
  truncated: number;
}

export function AdminConsole({ agencies: initialAgencies, clients, totalCount, truncated, freeRunLimit }: AdminConsoleProps) {
  const [agencies, setAgencies] = useState(initialAgencies);

  return (
    <>
      <div className="mb-6">
        <AgencyCard agencies={agencies} onChange={setAgencies} />
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-muted">
        <span>
          顧客 <span className="font-bold text-ink tabular-nums">{totalCount}</span> 件
        </span>
        {truncated > 0 && <span>（新しい順に {clients.length} 件を表示）</span>}
      </div>

      <ClientTable initial={clients} agencies={agencies} freeRunLimit={freeRunLimit} />
    </>
  );
}
