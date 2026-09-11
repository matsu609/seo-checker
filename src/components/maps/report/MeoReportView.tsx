/**
 * MEO 診断レポート本体（PDF 化される部分）。表示だけ。
 *
 * 構成は無料診断の報告書と揃える: 表紙帯 → 1 総合評価 → 2 総評 → 3 口コミ情報 →
 * 4〜7 カテゴリ別チェックリスト。操作系のボタンは呼び出し側（no-print）に置く。
 */
import { Donut, HBar, type HBarRow } from "@/components/charts";
import { EmptyLine, GradeScale, Num, ReportSection, SubHeading } from "@/components/free/report-parts";
import { ReportSheet } from "@/components/free/ReportSheet";
import { StatStrip } from "@/components/ui/StatCard";
import { formatDateTime } from "@/lib/report/format";
import type { MeoReport } from "@/lib/maps/report";
import { latestReviewAgeDays } from "@/lib/maps/score";
import { formatCount, formatRating } from "../format";
import { ChecklistSection } from "./ChecklistSection";
import { AreaSection } from "./AreaSection";
import { ExtraInfoSection } from "./ExtraInfoSection";
import { GoalSection } from "./GoalSection";
import { RankSection } from "./RankSection";

export interface MeoReportViewProps {
  report: MeoReport;
  /** AI 総評（取得済みなら段落）。無ければルール生成の総評を出す */
  aiCommentary: string[] | null;
  /**
   * paid = 有料ツール（/tools/maps）: 目指すべき状態・各項目の解説・付加情報・順位・周辺を出す
   * （r28 より前に保存した古い報告書でも出す。数字が無い節は「次回の一斉更新から」と表示）。
   * free = 無料診断（/meo）: 21 項目の採点と口コミ情報だけ。
   */
  variant?: "paid" | "free";
}

const STARS = [5, 4, 3, 2, 1] as const;

export function MeoReportView({ report, aiCommentary, variant = "free" }: MeoReportViewProps) {
  const { detail, score } = report;
  const grade = score.grade;
  const commentary = aiCommentary ?? report.commentary;
  const paid = variant === "paid";
  /** 古い形式（r28 より前の 21 項目）の報告書を有料ツールで見ている */
  const legacy = paid && score.extended !== true;

  const categoryRows: HBarRow[] = score.categories.map((c) => ({
    label: c.label,
    value: c.score ?? 0,
    valueLabel: c.score === null ? <span className="text-muted">未測定</span> : undefined,
    sublabel: `${c.measured} / ${c.total} 項目を測定`,
  }));

  // 有料: 1 総合 / 2 総評 / 3 目指すべき状態 / 4 口コミ / 5 付加情報 / (6 順位) / (7 周辺) / チェックリスト。無料: 1 / 2 / 3 口コミ / チェックリスト
  const checklistStart = paid ? 8 : 4;
  const rated = detail.reviews.filter((r) => r.rating !== null);
  const dist = STARS.map((star) => ({ star, count: rated.filter((r) => Math.round(r.rating ?? 0) === star).length }));
  const age = latestReviewAgeDays(detail, new Date(report.generatedAt));

  return (
    <div className="@container">
      <header className="rounded-t-sm border border-brand bg-brand px-5 py-6 text-on-brand @md:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.12em] text-on-brand-muted">MEO DIAGNOSTIC REPORT</p>
            <p className="mt-1 text-[22px] leading-snug font-bold @md:text-[26px]">Google ビジネス プロフィール診断報告書</p>
            <p className="mt-4 text-[18px] leading-snug font-bold break-words">{detail.name}</p>
            <p className="mt-1 text-[13px] leading-relaxed break-words text-on-brand-muted">
              {[detail.category, detail.address].filter(Boolean).join(" ・ ")}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <p className="text-[11px] text-on-brand-muted">総合評価</p>
            <p
              className="mx-auto mt-1 flex h-14 w-14 items-center justify-center rounded-sm border-2 bg-panel text-[32px] leading-none font-bold tabular-nums"
              style={grade ? { borderColor: grade.color, color: grade.color } : undefined}
            >
              {grade?.grade ?? "—"}
            </p>
            <p className="mt-1 text-[11px] text-on-brand-muted">{grade?.label ?? "未測定"}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] @md:grid-cols-4">
          <div>
            <dt className="text-on-brand-muted">診断日時</dt>
            <dd className="mt-0.5 tabular-nums">{formatDateTime(report.generatedAt)}</dd>
          </div>
          <div>
            <dt className="text-on-brand-muted">測定範囲</dt>
            <dd className="mt-0.5 tabular-nums">
              {score.checks.filter((c) => c.status !== "unavailable").length} / {score.checks.length} 項目
            </dd>
          </div>
          <div>
            <dt className="text-on-brand-muted">平均評価</dt>
            <dd className="mt-0.5 tabular-nums">
              {formatRating(detail.rating)}（{formatCount(detail.ratingCount)} 件）
            </dd>
          </div>
          <div>
            <dt className="text-on-brand-muted">データ</dt>
            <dd className="mt-0.5">{report.ownerInputAt ? "Google マップ公開情報 + オーナー入力" : "Google マップ公開情報"}</dd>
          </div>
        </dl>
      </header>

      <ReportSheet>
        <ReportSection number={1} title="総合評価">
          <div className="grid gap-6 @md:grid-cols-[11rem_1fr]">
            <div className="min-w-0">
              <Donut
                value={score.score ?? 0}
                label={score.score === null ? "—" : undefined}
                sublabel={score.score === null ? "未測定" : undefined}
                ariaLabel={
                  score.score === null
                    ? "総合スコア 未測定"
                    : `総合スコア ${score.score} / 100（${grade?.grade}・${grade?.label}）`
                }
              />
              <p className="mt-3 text-[13px] font-bold text-ink">測定できた項目での充実度</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                <GradeScale />
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                配点 <Num>{score.measuredWeight}</Num> / <Num>{score.totalWeight}</Num> 点分を測定
              </p>
            </div>
            <div className="min-w-0">
              <SubHeading note="棒は測定できた項目の獲得率">カテゴリ別</SubHeading>
              <HBar rows={categoryRows} ariaLabel="カテゴリ別スコア" labelWidth="6rem" />
            </div>
          </div>
        </ReportSection>

        <ReportSection number={2} title="総評">
          <div className="space-y-3">
            {commentary.map((p, i) => (
              <p key={i} className="text-[14px] leading-relaxed text-ink">
                {p}
              </p>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            {aiCommentary
              ? "※ 診断結果をもとに AI が作成した文章です。数値の根拠は各項目をご確認ください。"
              : "※ 診断結果から機械的に組み立てた文章です（生成 AI は使用していません）。"}
          </p>
        </ReportSection>

        {paid && <GoalSection number={3} />}

        <ReportSection number={paid ? 4 : 3} title="口コミ情報" lead="評価と件数は Google マップの公開情報です。口コミ本文は Google が返す最新 5 件までを表示します。">
          <StatStrip
            items={[
              { label: "平均評価", value: formatRating(detail.rating), unit: "/ 5.0" },
              { label: "口コミ件数", value: formatCount(detail.ratingCount), unit: "件" },
              { label: "最新の口コミ", value: age === null ? "—" : age, unit: age === null ? "" : "日前" },
              { label: "写真", value: detail.photoCount >= 10 ? "10+" : detail.photoCount, unit: "枚" },
            ]}
          />
          <SubHeading note={`取得できた ${rated.length} 件の内訳`} className="mt-6">
            星評価の内訳
          </SubHeading>
          {rated.length > 0 ? (
            <HBar
              rows={dist.map((d) => ({
                label: `${d.star} ★`,
                value: d.count,
                valueLabel: <Num>{d.count} 件</Num>,
              }))}
              max={Math.max(1, rated.length)}
              ticks={[]}
              valueTone="none"
              labelWidth="3.5rem"
              ariaLabel="星評価の内訳（取得できた口コミ）"
            />
          ) : (
            <EmptyLine>口コミ本文を取得できませんでした。</EmptyLine>
          )}
          <p className="mt-2 text-[11px] text-muted">
            全件の星評価分布は Business Profile 連携で取得できます。ここでは Google が返す最新の口コミだけを集計しています。
          </p>
          {detail.reviews.length > 0 && (
            <>
              <SubHeading className="mt-6">最近の口コミ</SubHeading>
              <ul className="divide-y divide-line border-y border-line">
                {detail.reviews.map((r, i) => (
                  <li key={`${r.publishedAt ?? ""}-${i}`} className="py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                      <span className="font-bold text-ink tabular-nums">{r.rating === null ? "—" : `★ ${r.rating.toFixed(1)}`}</span>
                      {r.author && <span>{r.author}</span>}
                      {r.relative && <span>{r.relative}</span>}
                    </div>
                    {r.text && <p className="mt-1 leading-relaxed text-ink">{r.text}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ReportSection>

        {paid && <ExtraInfoSection detail={detail} number={5} />}
        {/* 順位・周辺は有料の自社店舗にだけ付く（無料診断には無い。数字が無ければ各節が「次回から」と案内する） */}
        {paid && <RankSection rank={report.rank ?? null} number={6} />}
        {paid && <AreaSection area={report.area ?? null} number={7} />}

        {legacy && (
          <p className="mt-6 rounded-sm border border-line bg-surface px-3 py-2 text-[12px] leading-relaxed text-muted">
            この報告書は古い形式（21 項目）で保存されています。「オーナー情報の入力」を保存するか、次回の一斉更新で
            28 項目（属性・オーナー写真・口コミのキーワード・Google の警告など）の採点になります。
          </p>
        )}

        {score.categories.map((c, i) => (
          <ChecklistSection key={c.id} category={c} number={checklistStart + i} guide={paid} />
        ))}

        <p className="mt-6 text-[11px] text-muted">
          データ: Google Places API（Google マップ上の公開情報）
          {report.ownerInputAt ? `と、オーナー入力（${formatDateTime(report.ownerInputAt)} 時点）` : ""}。
          「未取得」の項目は Google マップの公開情報では取れないため、オーナーの入力があるときだけ評価に含まれます。
        </p>
      </ReportSheet>
    </div>
  );
}
