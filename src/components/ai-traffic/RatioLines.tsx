/**
 * AI 検索率の折れ線（対総セッション / 対自然検索）。
 *
 * 率は数 % のことが多く 0〜100% 固定軸だと潰れるので、上限は niceMax で自動調整する。
 * 分母が 0 のバケット（率が null）は線を切って描き、前のバケットの値を引き継がない。
 * 色は palette の hex を直接使う（PDF 化・印刷でも同じ色になるようにするため）。
 */
import { niceMax } from "@/components/charts";
import { palette } from "@/lib/ui/palette";

export interface RatioSeries {
  key: string;
  label: string;
  color: string;
  /** 0〜1 の割合。分母が 0 のときは null */
  values: readonly (number | null)[];
}

export interface RatioLinesProps {
  categories: readonly string[];
  series: readonly RatioSeries[];
  height?: number;
  /** x ラベルを間引く（例: 7 で 7 本に 1 つ） */
  labelEvery?: number;
  ariaLabel?: string;
}

const W = 640;
const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 20;
const GRID_STEPS = 4;

export function RatioLines({ categories, series, height = 180, labelEvery = 1, ariaLabel }: RatioLinesProps) {
  const n = categories.length;
  if (n === 0 || series.length === 0) {
    return <p className="text-[13px] text-muted">表示できるデータがありません。</p>;
  }

  // 百分率で軸を作る（0.031 → 3.1% → 上限 4%）
  const percents = series.map((s) => s.values.map((v) => (v === null ? null : v * 100)));
  const maxPercent = Math.max(0, ...percents.flat().filter((v): v is number => v !== null));
  const yMax = Math.min(100, niceMax(maxPercent, GRID_STEPS));

  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const x = (i: number) => (n <= 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (n - 1));
  const y = (percent: number) => PAD_T + innerH * (1 - Math.min(1, Math.max(0, percent / yMax)));
  const aria = ariaLabel ?? `${series.map((s) => s.label).join("・")}の推移（${n} 区分）`;

  return (
    <figure className="max-w-full">
      <svg
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={aria}
        className="block h-auto w-full"
      >
        <title>{aria}</title>
        {Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
          const value = (yMax / GRID_STEPS) * i;
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(value)} y2={y(value)} stroke={palette.chartGrid} strokeWidth={1} />
              <text x={PAD_L - 6} y={y(value) + 3} textAnchor="end" fontSize={9} fill={palette.muted}>
                {value >= 10 ? Math.round(value) : Number(value.toFixed(1))}%
              </text>
            </g>
          );
        })}
        {categories.map((c, i) =>
          i % Math.max(1, labelEvery) === 0 || i === n - 1 ? (
            <text key={`${c}-${i}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill={palette.muted}>
              {c}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          // null で線を切る（率が計算できないバケットをつながない）
          const segments: string[] = [];
          let current: string[] = [];
          percents[si].forEach((v, i) => {
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
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {percents[si].map((v, i) =>
                v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2} fill={s.color} />,
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
