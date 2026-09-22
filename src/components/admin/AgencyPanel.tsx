"use client";

/**
 * マスター画面の「管理アカウント」カードの入れ物。
 *
 * 2 枚を並べて持つ。
 *   AgencyCard     … 追加・解除（結果の一覧と、直前に追加した相手を返す）
 *   AgencyFlowCard … 追加したあと、その方が使いはじめるまでの案内
 *
 * 「直前に追加した相手」を親で持つのは、案内カードを**その結果の道のりで開く**ため
 * （招待を送ったのか、登録済みの方に権限を付けただけなのかで、相手のやることが変わる）。
 * 招待リンクもここを通って案内文に入る。画面を開き直すと消える（保存はしない）。
 */
import { useState } from "react";
import type { AgencyRow } from "@/lib/admin/agencies";
import type { AgencyEntry } from "@/lib/admin/onboarding";
import { AgencyCard } from "./AgencyCard";
import { AgencyFlowCard } from "./AgencyFlowCard";

export interface AddedAgency {
  kind: AgencyEntry;
  email: string;
  url: string | null;
}

export function AgencyPanel({ initial }: { initial: AgencyRow[] }) {
  const [agencies, setAgencies] = useState(initial);
  const [added, setAdded] = useState<AddedAgency | null>(null);
  return (
    <div className="space-y-6">
      <AgencyCard agencies={agencies} onChange={setAgencies} onAdded={setAdded} />
      {/*
        key を変えて作り直す。追加のたびに「いま起きたほうの道のり」から見せたいが、
        効果で state を書き戻すと、運用者が自分で切り替えたタブを奪ってしまう
        （React も効果での state 同期を勧めていない）。
      */}
      <AgencyFlowCard key={added ? `${added.kind}:${added.email}` : "none"} added={added} />
    </div>
  );
}
