"use client";

/**
 * タブと、サーバー側で描いたパネルを組み合わせる入れ物。
 *
 * パネルにサーバーコンポーネント（PlanGate など）を渡せるように、中身は
 * `panels` として受け取るだけにしてある（この部品自身は選択状態しか持たない）。
 * 選んでいないパネルは `hidden` で隠すだけなので、タブを行き来しても入力が消えない。
 */
import { useState, type ReactNode } from "react";
import { Tabs, type TabItem } from "./Tabs";

export interface TabPanelsProps {
  tabs: readonly TabItem<string>[];
  /** タブ ID → 中身 */
  panels: Record<string, ReactNode>;
  /** 最初に開くタブ（既定は先頭） */
  initial?: string;
  ariaLabel?: string;
  className?: string;
}

export function TabPanels({ tabs, panels, initial, ariaLabel, className = "" }: TabPanelsProps) {
  const [value, setValue] = useState(initial ?? tabs[0]?.id ?? "");
  return (
    <div className={className}>
      <Tabs tabs={tabs} value={value} onChange={setValue} ariaLabel={ariaLabel} />
      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== value} className="mt-6">
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
