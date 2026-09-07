/**
 * 「流入と検索順位」の複合グラフ（docs/reference/04_implementation-guide.md §18.2）。
 *
 * 左軸: チャネル別セッション（またはユーザー数）の積み上げ棒
 * 右軸: 登録キーワードの平均順位（上が 1 位になるよう反転）
 *        ＋ ファインダビリティスコア（0〜理論上限をグラフの下端〜上端に重ねる）
 *
 * スコアは Σ(月間検索数 × CTR(順位)) ÷ Σ 月間検索数 × 100 なので、全キーワードが
 * 1 位でも CTR カーブの 1 位（28%）が上限になる。0〜100 で描くと常に下から 1/4 に
 * 張り付いて読めないため、上端は理論上限（FINDABILITY_MAX）に合わせる。
 *
 * 依存なしの SVG。色は palette の hex を直接書く（PDF 化・印刷でも同じ色にするため）。
 * 欠損（その日に順位を計測していない）は線を切って描き、前の値を引き継がない。
 */
import { niceMax, round } from "@/components/charts";
import { AVERAGE_RANK_COLOR, FINDABILITY_COLOR } from "@/lib/site-report/channels";
import { CTR_CURVE } from "@/lib/site-report/findability";
import { palette } from "@/lib/ui/palette";

/**
 * ファインダビリティスコアが取りうる最大値（＝全キーワードが 1 位のときの値）。
 * CTR カーブの最大値から導くので、カーブを変えれば軸と説明文も追従する。
 */
export const FINDABILITY_MAX = Math.max(...CTR_CURVE.map((b) => b.ctr)) * 100;

export interface TrafficSeries {
  label: string;
  /** palette の hex */
  color: string;
  /** labels と同じ長さ */
  values: readonly number[];
}

export interface TrafficChartProps {
  labels: readonly string[];
  series: readonly TrafficSeries[];
  /** バケットごとの平均順位（未計測は null） */
  averageRank: ReadonlyArray<number | null>;
  /** バケットごとのファインダビリティスコア 0〜FINDABILITY_MAX（計算できなければ null） */
  findability: ReadonlyArray<number | null>;
  /** 右軸の下端になる順位（圏外を何位として平均したか）。除外時は 100 */
  worstRank: number;
  /** 左軸の指標名（凡例に出す） */
  metricLabel: string;
  ariaLabel?: string;
}

const W = 720;
const H = 280;
const PAD_L = 46;
const PAD_R = 42;
const PAD_T = 12;
const PAD_B = 28;

const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

/** 大きい数の目盛（12,000 → 12k） */
function tickLabel(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

export function TrafficChart({
  labels,
  series,
  averageRank,
  findability,
  worstRank,
  metricLabel,
  ariaLabel,
}: TrafficChartProps) {
  const n = labels.length;
  if (n === 0 || series.length === 0) {
    return <p className="text-[13px] text-muted">表示できるデータがありません。</p>;
  }

  const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const yMax = niceMax(Math.max(0, ...totals), 4);
  const slot = INNER_W / n;
  const bar = Math.max(3, Math.min(36, slot * 0.62));

  /** 左軸（値 → y） */
  const yLeft = (v: number) => round(PAD_T + INNER_H - (Math.min(Math.max(v, 0), yMax) / yMax) * INNER_H, 2);
  /** 右軸（順位 → y）。1 位が上、worstRank が下 */
  const bottomRank = Math.max(2, worstRank);
  const yRank = (rank: number) =>
    round(PAD_T + ((Math.min(Math.max(rank, 1), bottomRank) - 1) / (bottomRank - 1)) * INNER_H, 2);
  /** ファインダビリティ（0〜FINDABILITY_MAX → y）。下端 0、上端が理論上限 */
  const scoreTop = FINDABILITY_MAX > 0 ? FINDABILITY_MAX : 100;
  const yScore = (score: number) =>
    round(PAD_T + INNER_H - (Math.min(Math.max(score, 0), scoreTop) / scoreTop) * INNER_H, 2);
  const xCenter = (i: number) => round(PAD_L + slot * i + slot / 2, 2);

  const rankTicks = [1, Math.round((1 + bottomRank) / 2), bottomRank];
  const labelStep = Math.max(1, Math.ceil(n / 8));
  const aria =
    ariaLabel ??
    `${metricLabel}のチャネル別積み上げと、登録キーワードの平均順位・ファインダビリティスコアの推移（${n} 区分）`;

  /** null で線を切る（欠損を直線でつながない） */
  function segments(values: ReadonlyArray<number | null>, toY: (v: number) => number): string[] {
    const out: string[] = [];
    let current: string[] = [];
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        if (current.length > 0) out.push(current.join(" "));
        current = [];
        return;
      }
      current.push(`${xCenter(i)},${toY(v)}`);
    });
    if (current.length > 0) out.push(current.join(" "));
    return out;
  }

  const rankSegments = segments(averageRank, yRank);
  const scoreSegments = segments(findability, yScore);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={aria}
      className="block h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{aria}</title>

      {/* 左軸の目盛（横罫） */}
      {Array.from({ length: 5 }, (_, i) => {
        const value = (yMax / 4) * i;
        const y = yLeft(value);
        return (
          <g key={`grid-${i}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={palette.chartGrid} strokeWidth={1} />
            <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={9} fill={palette.muted}>
              {tickLabel(value)}
            </text>
          </g>
        );
      })}

      {/* 右軸の目盛（順位。上が 1 位） */}
      {rankTicks.map((rank) => (
        <text
          key={`rank-${rank}`}
          x={W - PAD_R + 6}
          y={yRank(rank) + 3}
          textAnchor="start"
          fontSize={9}
          fill={AVERAGE_RANK_COLOR}
        >
          {rank}位
        </text>
      ))}

      {/* 積み上げ棒 */}
      {labels.map((label, i) => {
        const x = round(PAD_L + slot * i + (slot - bar) / 2, 2);
        let acc = 0;
        return (
          <g key={`bar-${label}-${i}`}>
            {series.map((s) => {
              const v = Math.max(0, s.values[i] ?? 0);
              if (v <= 0) return null;
              const y0 = yLeft(acc);
              const y1 = yLeft(acc + v);
              acc += v;
              const h = round(y0 - y1, 2);
              if (h <= 0) return null;
              return <rect key={s.label} x={x} y={y1} width={round(bar, 2)} height={h} fill={s.color} />;
            })}
          </g>
        );
      })}

      {/* ファインダビリティスコア（破線） */}
      {scoreSegments.map((points, i) => (
        <polyline
          key={`score-${i}`}
          points={points}
          fill="none"
          stroke={FINDABILITY_COLOR}
          strokeWidth={2}
          strokeDasharray="5 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* 平均順位（実線 + 点） */}
      {rankSegments.map((points, i) => (
        <polyline
          key={`rank-line-${i}`}
          points={points}
          fill="none"
          stroke={AVERAGE_RANK_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {averageRank.map((v, i) =>
        v === null || !Number.isFinite(v) ? null : (
          <circle key={`rank-dot-${i}`} cx={xCenter(i)} cy={yRank(v)} r={2.5} fill={AVERAGE_RANK_COLOR} />
        ),
      )}

      {/* x 軸ラベル */}
      {labels.map((label, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <text key={`x-${label}-${i}`} x={xCenter(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={palette.muted}>
            {label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export interface TrafficChartLegendProps {
  series: readonly TrafficSeries[];
  metricLabel: string;
}

/** 凡例（HTML 11px）。折れ線 2 本はチャネルと分けて出す */
export function TrafficChartLegend({ series, metricLabel }: TrafficChartLegendProps) {
  return (
    <div className="mt-2 space-y-1 text-[11px] text-muted">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li className="font-bold text-ink">{metricLabel}（左軸）</li>
        {series.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4"
            style={{ backgroundColor: AVERAGE_RANK_COLOR }}
          />
          登録キーワードの平均順位（右軸・上が 1 位）
        </li>
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4"
            style={{ backgroundColor: FINDABILITY_COLOR }}
          />
          ファインダビリティスコア（グラフ下端が 0、上端が {FINDABILITY_MAX.toFixed(1)}
          ＝全キーワードが 1 位のときの上限）
        </li>
      </ul>
    </div>
  );
}
