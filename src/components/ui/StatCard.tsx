import type { ReactNode } from "react";

export interface StatDelta {
  /** 前期比の差分（表示は符号付き） */
  value: number;
  /** 単位や補足（例: "pt", "%"） */
  unit?: string;
  /** 増えるのが良い指標か（色の向き）。既定 true */
  positiveIsGood?: boolean;
  label?: string;
}

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: StatDelta;
  hint?: ReactNode;
  className?: string;
}

function formatDelta(d: StatDelta): string {
  const abs = Math.abs(d.value);
  const num = Number.isInteger(abs) ? abs.toLocaleString("ja-JP") : abs.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  const sign = d.value > 0 ? "+" : d.value < 0 ? "−" : "±";
  return `${sign}${num}${d.unit ?? ""}`;
}

/** KPI 1 個。数値 22px / 700 tabular + ラベル 11px muted */
export function StatCard({ label, value, unit, delta, hint, className = "" }: StatCardProps) {
  const dir = delta ? Math.sign(delta.value) : 0;
  const good = delta ? (delta.positiveIsGood ?? true ? dir > 0 : dir < 0) : false;
  const bad = delta ? (delta.positiveIsGood ?? true ? dir < 0 : dir > 0) : false;
  const deltaColor = good ? "text-pass" : bad ? "text-fail" : "text-muted";
  return (
    <div className={`rounded-sm border border-line bg-panel px-4 py-3 ${className}`}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] font-bold leading-none text-ink tabular-nums">{value}</span>
        {unit && <span className="text-[11px] text-muted">{unit}</span>}
      </div>
      {delta && (
        <div className={`mt-1 text-[11px] tabular-nums ${deltaColor}`}>
          {formatDelta(delta)}
          {delta.label && <span className="ml-1 text-muted">{delta.label}</span>}
        </div>
      )}
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export interface StatStripItem {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
}

/** KPI ストリップ。grid-cols-N divide-x border-y。総合評価とツール側で共用 */
export function StatStrip({ items, className = "" }: { items: StatStripItem[]; className?: string }) {
  const cols =
    items.length <= 2 ? "grid-cols-2" : items.length === 3 ? "grid-cols-3" : items.length === 4 ? "grid-cols-4" : "grid-cols-2 @md:grid-cols-5";
  return (
    <dl className={`grid ${cols} divide-x divide-line border-y border-line py-3 ${className}`}>
      {items.map((it, i) => (
        <div key={i} className={`px-3 text-center ${it.className ?? ""}`}>
          <dd className="text-[22px] font-bold leading-none text-ink tabular-nums">
            {it.value}
            {it.unit && <span className="ml-0.5 text-[11px] font-normal text-muted">{it.unit}</span>}
          </dd>
          <dt className="mt-1 text-[11px] text-muted">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}
