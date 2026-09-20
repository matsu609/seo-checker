"use client";

/**
 * 計測対象ごとの棒グラフ（利用者の指示 2026-09-20
 * 「キーワードごとに棒グラフ。定期的にチェックして、どれぐらいヒットするかを
 *  確率にある程度幅を持たせて分布で見たい」）。
 *
 * 1 行 = プロンプト 1 本 または キーワード 1 語。
 *   棒 … 4 週ローリングの出現率（点推定）
 *   帯 … Wilson 95% 信頼区間（仕様書 §5.1-2。**幅がそのまま「読み取れなさ」**）
 *
 * 仕様書 §5.1-3 は「観測が 30 件に満たないものはパーセントを出さず段階で見せる」
 * だが、この画面は**帯を必ず一緒に描く**ことで幅を隠さないため、パーセントも出す。
 * ただし n<30 の行は数値を muted にし「参考値」と明示して、断定させない。
 * （この逸脱は docs/dev/OPERATIONS.md の判断の経緯に記録した）
 */
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { HBar, type HBarRow } from "@/components/charts";
import { palette } from "@/lib/ui/palette";
import { availableModels, filterTargetsByModel } from "@/lib/geo/aggregate";
import { BAND_LABELS, PERCENT_DISPLAY_MIN_N } from "@/lib/geo/stats";
import { GEO_MODEL_LABELS, type GeoModel } from "@/lib/geo/types";
import { pct } from "@/lib/report/format";
import type { TargetRow } from "./client";

const BAND_TONE = { often: "pass", sometimes: "warn", rare: "fail", none: "neutral" } as const;

/** 行の並び順。既定は出現率の高い順（サーバーが既に並べてある） */
type SortId = "rate" | "label";

export interface TargetBarsProps {
  rows: TargetRow[];
  title: string;
  description: string;
  /** 1 行あたりの観測数の目安を出すための説明（「週 3 回 × 4 週 = 12 回」など） */
  cadence: string;
  /** 行が 0 件のときの案内 */
  emptyText: string;
  /** モデルで絞り込めるようにする（プロンプトの表だけ） */
  modelFilter?: boolean;
}

export function TargetBars({ rows, title, description, cadence, emptyText, modelFilter = false }: TargetBarsProps) {
  const [model, setModel] = useState<GeoModel | "all">("all");
  const [sort, setSort] = useState<SortId>("rate");

  // 絞り込み: モデル別の内訳から、その モデル だけの率と区間を作り直す
  const shown = filterTargetsByModel(rows, model);
  const sorted =
    sort === "label" ? [...shown].sort((a, b) => a.label.localeCompare(b.label, "ja")) : [...shown].sort((a, b) => b.rate - a.rate || b.n - a.n);

  const models = availableModels(rows);
  const bars: HBarRow[] = sorted.map((row) => {
    const enough = row.n >= PERCENT_DISPLAY_MIN_N;
    const margin = Math.round(Math.max(row.ciHigh - row.rate, row.rate - row.ciLow) * 100);
    return {
      label: row.label,
      value: row.rate * 100,
      max: 100,
      color: enough ? palette.chart[0] : palette.chart[4],
      range: { min: row.ciLow * 100, max: row.ciHigh * 100 },
      sublabel: `${row.n} 回中 ${row.hits} 回・${BAND_LABELS[row.band]}`,
      valueLabel: (
        <span className={enough ? "text-ink" : "text-muted"}>
          {pct(row.rate)}
          <span className="block text-[11px] font-normal text-muted">±{margin}pt</span>
        </span>
      ),
    };
  });

  const scarce = sorted.filter((r) => r.n > 0 && r.n < PERCENT_DISPLAY_MIN_N).length;

  return (
    <Card
      title={title}
      description={description}
      printCard
      actions={
        rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {modelFilter && models.length > 1 && (
              <select
                className="rounded-sm border border-line bg-panel px-2 py-1 text-[12px] text-ink"
                value={model}
                onChange={(e) => setModel(e.target.value as GeoModel | "all")}
                aria-label="モデルで絞り込む"
              >
                <option value="all">すべてのモデル</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {GEO_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            )}
            <select
              className="rounded-sm border border-line bg-panel px-2 py-1 text-[12px] text-ink"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              aria-label="並び順"
            >
              <option value="rate">出現率の高い順</option>
              <option value="label">名前順</option>
            </select>
          </div>
        )
      }
    >
      {sorted.length === 0 ? (
        <p className="text-[13px] text-muted">{emptyText}</p>
      ) : (
        <>
          <HBar
            rows={bars}
            max={100}
            ticks={[25, 50, 75]}
            valueTone="none"
            labelWidth="14rem"
            ariaLabel={title}
            legend={
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                <span className="mr-3">
                  <span aria-hidden style={{ color: palette.chart[0] }}>
                    ■
                  </span>{" "}
                  出現率（4 週ローリングの点推定）
                </span>
                <span className="mr-3">
                  <span aria-hidden style={{ color: palette.chart[2] }}>
                    ▭
                  </span>{" "}
                  ありうる範囲（95% 信頼区間）
                </span>
                <span>
                  <span aria-hidden style={{ color: palette.secondary }}>
                    ┆
                  </span>{" "}
                  目盛 25 / 50 / 75%
                </span>
              </p>
            }
          />
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            計測は{cadence}です。<strong className="font-bold">棒は「いまのところの平均」、帯は「本当の値がこの辺りにある」という幅</strong>で、
            回数が少ないほど帯は広くなります。帯が重なっている 2 行は、順位が入れ替わっていても差は読み取れません。
            {scarce > 0 && (
              <>
                {" "}
                観測が {PERCENT_DISPLAY_MIN_N} 回に満たない {scarce} 行は数値を薄く出しています（参考値）。
              </>
            )}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sorted.slice(0, 6).map((row) => (
              <li key={row.targetId}>
                <Badge tone={BAND_TONE[row.band]} icon={false}>
                  {row.label}: {BAND_LABELS[row.band]}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
