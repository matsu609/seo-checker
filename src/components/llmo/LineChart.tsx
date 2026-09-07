/**
 * 複数系列の折れ線（0〜100% 固定軸）。SVG のみで描く。
 *
 * 欠損（その日に成功した回答が無い）は線を切って描き、前日値を引き継がない。
 * 色は palette の hex を直接使う（PDF 化・印刷でも同じ色にするため）。
 */
import { palette } from "@/lib/ui/palette";
import type { Series } from "@/lib/llmo/aggregate";

export interface LineChartProps {
  dates: readonly string[];
  series: readonly Series[];
  height?: number;
  ariaLabel?: string;
}

const W = 640;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 22;

/** YYYY-MM-DD → M/D */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

export function LineChart({ dates, series, height = 200, ariaLabel }: LineChartProps) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const x = (i: number) => (dates.length <= 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (dates.length - 1));
  const y = (v: number) => PAD_T + innerH * (1 - Math.min(1, Math.max(0, v)));

  // 目盛は 0 / 50 / 100%
  const ticks = [0, 0.5, 1];
  const labelStep = Math.max(1, Math.ceil(dates.length / 6));
  const aria = ariaLabel ?? `${series.length} 系列 × ${dates.length} 日の推移`;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={aria}
      className="block h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{aria}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} y1={y(t)} x2={W - PAD_R} y2={y(t)} stroke={palette.chartGrid} strokeWidth={1} />
          <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={palette.muted}>
            {Math.round(t * 100)}%
          </text>
        </g>
      ))}
      {dates.map((d, i) =>
        i % labelStep === 0 || i === dates.length - 1 ? (
          <text key={d} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill={palette.muted}>
            {shortDate(d)}
          </text>
        ) : null,
      )}
      {series.map((s) => {
        // null で線を切る（欠損を直線でつながない）
        const segments: string[] = [];
        let current: string[] = [];
        s.values.forEach((v, i) => {
          if (v === null) {
            if (current.length > 0) segments.push(current.join(" "));
            current = [];
            return;
          }
          current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
        });
        if (current.length > 0) segments.push(current.join(" "));
        return (
          <g key={s.key}>
            {segments.map((points, i) => (
              <polyline
                key={i}
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={s.isSelf ? 2.5 : 1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {s.values.map((v, i) =>
              v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={s.isSelf ? 3 : 2} fill={s.color} />,
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 折れ線の凡例（HTML 11px）。自社には印を付ける */
export function LineChartLegend({ series }: { series: readonly Series[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className={s.isSelf ? "font-bold text-ink" : ""}>{s.label}</span>
          {s.isSelf && <span className="text-[10px] text-accent">自社</span>}
        </li>
      ))}
    </ul>
  );
}
