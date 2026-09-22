"use client";

/**
 * 折れ線グラフ（推移用。SVG、依存なし）。順位のように「小さいほど良い」値は invert で上下を返す。
 *
 * 決めごと（docs/dev/design-spec.md のチャートの約束 + dataviz の手順）:
 * - 線は 2px・丸い結合、点は半径 4px。色は palette.chart を系列の順に固定で割り当てる（循環させない）
 * - **実測でない線（見本・予測）は `dashed` で破線にする。**実線 = 実測、破線 = 実測ではない、を崩さない
 * - 色だけに頼らない: 系列ごとに点の形を変え、凡例と線の端のラベル（4 系列まで）で名前を出す。表も付ける
 * - 十字線 + ツールチップ: 縦の細線が最も近い日付に吸い付き、その日の全系列の値を並べる（キーボードでも動く）
 * - 文字は palette の文字色（系列の色で文字を塗らない）
 * - null（圏外・未取得）は線を切る（0 や下限に描かない）
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { palette } from "@/lib/ui/palette";

export interface LineSeries {
  id: string;
  label: string;
  /** labels と同じ長さ。null は欠測（線を切る） */
  values: readonly (number | null)[];
  /**
   * 破線で描く。**実測ではない線**（見本・予測・目標）に使う。
   * 凡例と表の見た目も破線に合わせるので、実線と混ざらない。
   */
  dashed?: boolean;
  /**
   * 線の下を淡く塗る。**主役の系列 1 本だけ**に付ける（全部塗ると重なって読めない）。
   * 欠測で線が切れている区間は塗らない。
   */
  fill?: boolean;
}

export interface LineChartProps {
  /** x の目盛り（日付など。表示は短くしてよい） */
  labels: readonly string[];
  series: readonly LineSeries[];
  /** 小さいほど上に描く（順位） */
  invert?: boolean;
  yMin?: number;
  yMax?: number;
  /** y の目盛り。省略時は自動 */
  yTicks?: readonly number[];
  height?: number;
  /** 値の表示（ツールチップ・表） */
  format?: (value: number | null) => string;
  /** null の表示（既定「—」） */
  nullLabel?: string;
  ariaLabel: string;
  /** 表の見出し（x 列） */
  xHeader?: string;
  className?: string;
}

const PAD = { top: 12, right: 16, bottom: 28, left: 40 };
/** 線の端に名前を出す系列数の上限（それ以上は凡例だけ） */
const END_LABEL_MAX = 4;
/**
 * 線の端のラベルを出さない文字数。日本語のキーワードは長く、右端に置くと
 * 線や隣のラベルに重なる。**凡例と表には必ず出ている**ので、重なるくらいなら出さない
 * （利用者の指示 2026-09-22 で順位の推移を画面の先頭に出したとき、実際に重なった）。
 */
const END_LABEL_MAX_CHARS = 10;
const MARKERS = ["circle", "square", "diamond", "triangle", "cross", "plus"] as const;
/**
 * 系列の色（palette.chart を並べ替えたもの）。最初の 4 色は色覚多様性の検証（dataviz の validate_palette）で
 * 隣り合う色の区別が付く並び。5・6 色目は区別が弱いので、点の形・凡例・表で補う
 */
const SERIES_COLORS = [palette.chart[0], palette.chart[3], palette.chart[1], palette.chart[2], palette.chart[4], palette.chart[5]] as const;
type Marker = (typeof MARKERS)[number];

function markerOf(index: number): Marker {
  return MARKERS[index % MARKERS.length];
}

/** 系列の点の形（色だけに頼らない二次の符号） */
function MarkerShape({ kind, cx, cy, color, r = 4 }: { kind: Marker; cx: number; cy: number; color: string; r?: number }) {
  switch (kind) {
    case "square":
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={color} />;
    case "diamond":
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} fill={color} />;
    case "triangle":
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} fill={color} />;
    case "cross":
      return (
        <g stroke={color} strokeWidth={2.5} strokeLinecap="round">
          <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
          <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} />
        </g>
      );
    case "plus":
      return (
        <g stroke={color} strokeWidth={2.5} strokeLinecap="round">
          <line x1={cx - r - 1} y1={cy} x2={cx + r + 1} y2={cy} />
          <line x1={cx} y1={cy - r - 1} x2={cx} y2={cy + r + 1} />
        </g>
      );
    default:
      return <circle cx={cx} cy={cy} r={r} fill={color} />;
  }
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const defaultFormat = (v: number | null) => (v === null ? "—" : v.toLocaleString("ja-JP"));

export function LineChart({ labels, series, invert = false, yMin, yMax, yTicks, height = 240, format = defaultFormat, nullLabel = "—", ariaLabel, xHeader = "日付", className = "" }: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.max(280, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = yMin ?? (all.length > 0 ? Math.min(...all) : 0);
  const hi = yMax ?? (all.length > 0 ? Math.max(...all) : 1);
  const span = hi - lo || 1;
  /**
   * 線の端に名前を出すときは、**その名前のぶん右に余白を作る**。
   * 作らないと、最後の点が図の右端に来るのでラベルが線の上に重なって読めない
   * （2026-09-22 に順位の推移を画面の先頭へ出したとき、実際に重なった）。
   */
  const endLabelNames = series.length <= END_LABEL_MAX ? series.map((s) => s.label).filter((l) => l.length <= END_LABEL_MAX_CHARS) : [];
  const longestEndLabel = endLabelNames.reduce((max, l) => Math.max(max, l.length), 0);
  // 日本語は 1 文字およそ 11px（fontSize 11）。行き過ぎると図が痩せるので上限を置く
  const padRight = longestEndLabel > 0 ? Math.min(150, PAD.right + 8 + longestEndLabel * 11) : PAD.right;
  const plotW = Math.max(40, width - PAD.left - padRight);
  const plotH = Math.max(40, height - PAD.top - PAD.bottom);
  const n = labels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => {
    const t = (v - lo) / span;
    return PAD.top + (invert ? t : 1 - t) * plotH;
  };
  const ticks = yTicks ?? niceTicks(lo, hi);
  // x の目盛りは詰まりすぎないよう最大 8 個に間引く
  const step = Math.max(1, Math.ceil(n / 8));
  const xTickIdx = labels.map((_, i) => i).filter((i) => i % step === 0 || i === n - 1);

  function nearestIndex(clientX: number): number | null {
    const el = ref.current;
    if (!el || n === 0) return null;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (n === 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover((h) => Math.max(0, (h ?? n) - 1));
    } else if (e.key === "Escape") setHover(null);
  }

  const paths = series.map((s) => {
    let d = "";
    let open = false;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  });

  /**
   * 塗り用の path。線と同じ区切りで区間ごとに閉じる（欠測をまたいで塗らない）。
   * 下端は目盛りの底（plot の下辺）。
   */
  const bottom = PAD.top + plotH;
  const areas = series.map((s) => {
    if (!s.fill) return "";
    let d = "";
    let start: number | null = null;
    let prev: number | null = null;
    s.values.forEach((v, i) => {
      const ok = v !== null && Number.isFinite(v);
      if (ok) {
        if (start === null) {
          start = i;
          d += `M${x(i).toFixed(1)},${bottom.toFixed(1)}L${x(i).toFixed(1)},${y(v as number).toFixed(1)}`;
        } else {
          d += `L${x(i).toFixed(1)},${y(v as number).toFixed(1)}`;
        }
        prev = i;
      } else if (start !== null && prev !== null) {
        d += `L${x(prev).toFixed(1)},${bottom.toFixed(1)}Z`;
        start = null;
        prev = null;
      }
    });
    if (start !== null && prev !== null) d += `L${x(prev).toFixed(1)},${bottom.toFixed(1)}Z`;
    return d;
  });

  // 線の端のラベル（最後に値がある点）。4 系列まで。近すぎるものは凡例に任せる
  const endLabels: { sid: string; label: string; px: number; py: number }[] = [];
  if (series.length <= END_LABEL_MAX) {
    for (const s of series) {
      const lastIdx = s.values.reduce<number>((acc, v, i) => (v === null ? acc : i), -1);
      if (lastIdx < 0) continue;
      const py = y(s.values[lastIdx] as number);
      if (s.label.length > END_LABEL_MAX_CHARS) continue;
      if (endLabels.some((e) => Math.abs(e.py - py) < 12)) continue;
      endLabels.push({ sid: s.id, label: s.label, px: x(lastIdx), py });
    }
  }

  const hoverX = hover !== null ? x(hover) : null;
  const tooltipLeft = hoverX !== null ? Math.min(Math.max(hoverX, PAD.left), Math.max(PAD.left, width - 160)) : 0;

  return (
    <div className={className}>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => setHover(nearestIndex(e.clientX))}
          onPointerLeave={() => setHover(null)}
          className="block max-w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <title>{ariaLabel}</title>
          {/* 目盛り線（細く・薄く。データより前に出ない） */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={palette.chartGrid} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={palette.muted}>
                {format(t)}
              </text>
            </g>
          ))}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill={palette.muted}>
              {labels[i]}
            </text>
          ))}
          {/* 十字線 */}
          {hoverX !== null && <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + plotH} stroke={palette.muted} strokeWidth={1} />}
          {/* 線と点 */}
          {series.map((s, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];
            return (
              <g key={s.id}>
                {areas[si] && <path d={areas[si]} fill={color} fillOpacity={0.12} stroke="none" />}
                <path
                  d={paths[si]}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "6 4" : undefined}
                />
                {s.values.map((v, i) =>
                  v === null || !Number.isFinite(v) ? null : (
                    <g key={i}>
                      {/* 重なった点が読めるよう、地色の輪（2px）を先に敷く */}
                      <circle cx={x(i)} cy={y(v)} r={6} fill={palette.panel} />
                      <MarkerShape kind={markerOf(si)} cx={x(i)} cy={y(v)} color={color} r={hover === i ? 5 : 4} />
                    </g>
                  ),
                )}
              </g>
            );
          })}
          {endLabels.map((e) => (
            <text key={e.sid} x={e.px + 8} y={e.py + 4} fontSize={11} fill={palette.ink} textAnchor="start">
              {e.label}
            </text>
          ))}
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-[10rem] rounded-sm border border-line bg-panel p-2 text-[12px] shadow-sm"
            style={{ left: tooltipLeft }}
          >
            <div className="mb-1 font-bold text-ink">{labels[hover]}</div>
            <ul className="space-y-0.5">
              {series.map((s, si) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-0.5 w-3 shrink-0" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                  <span className="font-bold tabular-nums text-ink">{s.values[hover] === null ? nullLabel : format(s.values[hover] ?? null)}</span>
                  <span className="min-w-0 truncate text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {series.length >= 2 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink" aria-label="凡例">
          {series.map((s, si) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <svg width={22} height={12} aria-hidden="true">
                <line
                  x1={0}
                  x2={22}
                  y1={6}
                  y2={6}
                  stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
                <MarkerShape kind={markerOf(si)} cx={11} cy={6} color={SERIES_COLORS[si % SERIES_COLORS.length]} r={3} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-muted">表で見る</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-[12px]" aria-describedby={`${id}-table`}>
            <caption id={`${id}-table`} className="sr-only">
              {ariaLabel}
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="py-1 pr-3 font-normal">{xHeader}</th>
                {series.map((s) => (
                  <th key={s.id} className="py-1 pr-3 font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l} className="border-b border-line">
                  <td className="py-1 pr-3 tabular-nums text-muted">{l}</td>
                  {series.map((s) => (
                    <td key={s.id} className="py-1 pr-3 tabular-nums text-ink">
                      {s.values[i] === null ? nullLabel : format(s.values[i] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
