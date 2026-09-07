import { palette } from "@/lib/ui/palette";
import { clamp, niceMax, round } from "./math";

export interface StackedSeries {
  label: string;
  /** palette の hex */
  color: string;
  /** categories と同じ長さ */
  values: readonly number[];
}

export interface StackedBarProps {
  /** x 軸のラベル（日付・キーワードなど） */
  categories: readonly string[];
  series: readonly StackedSeries[];
  /** 既定 400 */
  width?: number;
  /** 既定 160 */
  height?: number;
  gridSteps?: number;
  /** 各柱を 100% に正規化する */
  normalize?: boolean;
  legend?: boolean;
  ariaLabel?: string;
  /** x ラベルを間引く（例: 7 で 7 本に 1 つ） */
  labelEvery?: number;
  className?: string;
}

/**
 * 積み上げ縦棒（x ラベル × 系列）。凡例・x ラベルは HTML。
 */
export function StackedBar({
  categories,
  series,
  width = 400,
  height = 160,
  gridSteps = 4,
  normalize = false,
  legend = true,
  ariaLabel,
  labelEvery = 1,
  className = "",
}: StackedBarProps) {
  const n = categories.length;
  if (n === 0 || series.length === 0) {
    return <p className={`text-[13px] text-muted ${className}`}>表示できるデータがありません。</p>;
  }
  const totals = categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const yMax = normalize ? 100 : niceMax(Math.max(0, ...totals), gridSteps);
  const slot = width / n;
  const bar = Math.max(4, Math.min(40, slot * 0.6));
  const y = (v: number) => round(height - (clamp(v, 0, yMax) / yMax) * height, 2);
  const aria =
    ariaLabel ??
    `${series.map((s) => s.label).join("・")}の積み上げ。${categories[0]}〜${categories[n - 1]}、${n} 区分`;

  return (
    <figure className={`max-w-full ${className}`} style={{ width }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria} className="block h-auto w-full">
        <title>{aria}</title>
        {Array.from({ length: gridSteps + 1 }, (_, i) => {
          const gy = y((yMax / gridSteps) * i);
          return <line key={i} x1={0} x2={width} y1={gy} y2={gy} stroke={palette.chartGrid} strokeWidth={1} />;
        })}
        {categories.map((cat, i) => {
          const x = round(slot * i + (slot - bar) / 2, 2);
          let acc = 0;
          const total = totals[i];
          return (
            <g key={`${cat}-${i}`}>
              {series.map((s) => {
                const raw = Math.max(0, s.values[i] ?? 0);
                const v = normalize ? (total > 0 ? (raw / total) * 100 : 0) : raw;
                const y0 = y(acc);
                const y1 = y(acc + v);
                acc += v;
                const h = round(y0 - y1, 2);
                if (h <= 0) return null;
                return <rect key={s.label} x={x} y={y1} width={round(bar, 2)} height={h} fill={s.color} />;
              })}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {categories.map((c, i) => (
            <div key={`${c}-${i}`} className="truncate text-[11px] text-muted tabular-nums">
              {i % Math.max(1, labelEvery) === 0 ? c : ""}
            </div>
          ))}
        </div>
        {legend && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            {series.map((s) => (
              <li key={s.label} className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}

export interface SegmentBarSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * 1 本の横棒を区分で分ける（例: 配点構成 20/25/20/15/20）。400×12、ラベルは HTML。
 */
export function SegmentBar({
  segments,
  ariaLabel,
  className = "",
}: {
  segments: readonly SegmentBarSegment[];
  ariaLabel?: string;
  className?: string;
}) {
  const W = 400;
  const H = 12;
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) return <p className={`text-[13px] text-muted ${className}`}>表示できるデータがありません。</p>;
  const aria = ariaLabel ?? segments.map((s) => `${s.label} ${s.value}`).join("、");
  // 各区分の x 位置を先に積算しておく
  const placed = segments.reduce<Array<{ seg: SegmentBarSegment; x: number; w: number }>>((acc, seg) => {
    const x = acc.length > 0 ? acc[acc.length - 1].x + acc[acc.length - 1].w : 0;
    const w = round((Math.max(0, seg.value) / total) * W, 2);
    acc.push({ seg, x: round(x, 2), w });
    return acc;
  }, []);
  return (
    <figure className={className}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={aria} className="block h-3 w-full">
        <title>{aria}</title>
        {placed.map(({ seg, x, w }) => (
          <rect key={seg.label} x={x} y={0} width={w} height={H} fill={seg.color} />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label} <span className="tabular-nums">{s.value}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
