import { palette } from "@/lib/ui/palette";
import { lastPoint, polylinePoints } from "./math";

export interface SparklineProps {
  values: readonly number[];
  /** 既定 120×28 */
  width?: number;
  height?: number;
  /** palette の hex。既定 chart-1 */
  color?: string;
  ariaLabel?: string;
  className?: string;
}

/** 折れ線の小型版（ツール用）。末尾に r=2 の丸印 */
export function Sparkline({ values, width = 120, height = 28, color = palette.chart[0], ariaLabel, className = "" }: SparklineProps) {
  const vals = values.filter((v) => Number.isFinite(v));
  if (vals.length === 0) {
    return (
      <span className={`text-[13px] text-muted ${className}`} aria-label={ariaLabel ?? "データなし"}>
        —
      </span>
    );
  }
  const points = polylinePoints(vals, width, height, 3);
  const end = lastPoint(points);
  const aria = ariaLabel ?? `${vals.length} 点の推移。最新 ${vals[vals.length - 1]}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria} className={`block h-auto max-w-full ${className}`}>
      <title>{aria}</title>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {end && <circle cx={end.x} cy={end.y} r={2} fill={color} />}
    </svg>
  );
}
