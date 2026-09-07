"use client";

import { Badge, Button, Callout, Card, DataTable, StatCard, type Column } from "@/components/ui";
import { HBar } from "@/components/charts";
import { csvFileName, downloadCsv, type CsvColumn } from "@/lib/export/csv";
import { STAT_METRICS, formatStat } from "@/lib/page-diagnosis/stats";
import type { StoredDiagnosis } from "@/lib/page-diagnosis/store";
import { SERP_FEATURE_LABELS, type SerpFeature } from "@/lib/serp/types";
import { palette } from "@/lib/ui/palette";

interface Row {
  position: number;
  title: string;
  url: string;
  charCount: number | null;
  images: number | null;
  headings: number | null;
  isSelf: boolean;
  failed: boolean;
}

function featureLabel(key: string): string {
  return SERP_FEATURE_LABELS[key as SerpFeature] ?? key;
}

function buildRows(diagnosis: StoredDiagnosis): Row[] {
  const selfUrl = diagnosis.targetUrl?.replace(/\/$/, "").toLowerCase() ?? null;
  return diagnosis.competitors.map((c) => ({
    position: c.position,
    title: c.title,
    url: c.url,
    charCount: c.measurement?.charCount ?? null,
    images: c.measurement?.images ?? null,
    headings: c.measurement?.headings.length ?? null,
    isSelf: selfUrl !== null && c.url.replace(/\/$/, "").toLowerCase() === selfUrl,
    failed: c.measurement === null,
  }));
}

const CSV_COLUMNS: CsvColumn<Row>[] = [
  { header: "順位", value: (r) => r.position },
  { header: "タイトル", value: (r) => r.title },
  { header: "URL", value: (r) => r.url },
  { header: "文字数", value: (r) => r.charCount ?? "" },
  { header: "画像数", value: (r) => r.images ?? "" },
  { header: "見出し数", value: (r) => r.headings ?? "" },
  { header: "自社", value: (r) => (r.isSelf ? "○" : "") },
];

/** SERP 分析タブ: ランキング表・傾向・検索意図・フィーチャー・自社 vs Top10 平均 */
export function SerpTab({ diagnosis }: { diagnosis: StoredDiagnosis }) {
  const rows = buildRows(diagnosis);
  const estimated = diagnosis.serpSource === "web_search";

  const columns: Column<Row>[] = [
    {
      key: "position",
      header: "順位",
      width: "4rem",
      align: "right",
      sortable: true,
      accessor: (r) => r.position,
      render: (r) => (
        <span className="tabular-nums">
          {r.position}
          {estimated ? "*" : ""}
        </span>
      ),
    },
    {
      key: "title",
      header: "タイトル",
      accessor: (r) => r.title,
      render: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">{r.title}</span>
            {r.isSelf && <Badge tone="info">自社</Badge>}
          </div>
          {r.failed && <span className="text-[12px] text-muted">本文を取得できませんでした</span>}
        </div>
      ),
    },
    {
      key: "url",
      header: "URL",
      accessor: (r) => r.url,
      render: (r) => (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent underline-offset-2 hover:underline"
        >
          {r.url}
        </a>
      ),
    },
    {
      key: "charCount",
      header: "文字数",
      align: "right",
      nowrap: true,
      sortable: true,
      accessor: (r) => r.charCount,
      render: (r) => formatStat(r.charCount),
    },
    {
      key: "images",
      header: "画像数",
      align: "right",
      nowrap: true,
      sortable: true,
      accessor: (r) => r.images,
      render: (r) => formatStat(r.images),
    },
  ];

  // 自社 vs Top10 平均（指標ごとに 0〜最大値で正規化して並べる）
  const compareRows = STAT_METRICS.flatMap((metric) => {
    const s = diagnosis.stats[metric.key];
    if (s.average === null && s.self === null) return [];
    const max = Math.max(s.average ?? 0, s.self ?? 0, 1);
    return [
      {
        label: `${metric.label}（Top10 平均）`,
        value: s.average ?? 0,
        max,
        color: palette.chart[2],
        valueLabel: formatStat(s.average),
      },
      {
        label: `${metric.label}（自社）`,
        value: s.self ?? 0,
        max,
        color: palette.chart[0],
        valueLabel: formatStat(s.self),
      },
    ];
  });

  return (
    <div className="space-y-6">
      {estimated && (
        <Callout tone="warn" title="この SERP は推定（Web 検索による）です">
          SERPAPI_KEY が未設定のため、上位ページの一覧は Claude の Web 検索から組み立てた推定です。
          Google の実際の掲載順位とは異なります。順位を実測するには SERPAPI_KEY を設定してください。
        </Callout>
      )}

      <Card
        title="ランキング Top10"
        description={
          estimated
            ? "* が付いた順位は推定です。文字数・画像数は各ページを取得して実測した値です。"
            : "文字数・画像数は各ページを取得して実測した値です。"
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv(csvFileName("page-diagnosis-serp", new Date()), CSV_COLUMNS, rows)}
            disabled={rows.length === 0}
          >
            この表を CSV でダウンロード
          </Button>
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => `${r.position}:${r.url}`}
          minWidth="48rem"
          emptyText="上位ページを取得できませんでした。"
          rowClassName={(r) => (r.isSelf ? "bg-accent-soft" : undefined)}
        />
        {diagnosis.failures.length > 0 && (
          <div className="mt-4 rounded-sm border border-line bg-surface p-3 text-[12px] text-muted">
            <p className="font-bold text-ink">取得できなかったページ（{diagnosis.failures.length} 件）</p>
            <ul className="mt-1 space-y-0.5">
              {diagnosis.failures.map((f) => (
                <li key={f.url} className="break-all">
                  {f.position !== null ? `${f.position} 位: ` : "対象ページ: "}
                  {f.url} — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="自社 vs Top10 平均" description="指標ごとに Top10 の平均値と対象ページの値を並べています。">
        {diagnosis.self ? (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {STAT_METRICS.slice(0, 3).map((metric) => {
                const s = diagnosis.stats[metric.key];
                const good = s.gap === null ? undefined : metric.moreIsBetter ? s.gap >= 0 : s.gap <= 0;
                return (
                  <StatCard
                    key={metric.key}
                    label={`${metric.label}（対象ページ）`}
                    value={formatStat(s.self)}
                    unit={metric.unit}
                    hint={`Top10 平均 ${formatStat(s.average)} / 中央値 ${formatStat(s.median)}`}
                    {...(s.gap !== null
                      ? { delta: { value: s.gap, label: "平均との差", positiveIsGood: good !== false } }
                      : {})}
                  />
                );
              })}
            </div>
            <HBar rows={compareRows} valueTone="none" labelWidth="12rem" legend={false} ariaLabel="自社と Top10 平均の比較" />
          </>
        ) : (
          <p className="text-[13px] text-muted">
            対象ページがない（または取得できなかった）ため、比較は表示できません。Top10 の平均値は下の表で確認できます。
          </p>
        )}
      </Card>

      <Card title="Top10 の統計">
        <DataTable
          rows={STAT_METRICS.map((m) => ({ ...m, stats: diagnosis.stats[m.key] }))}
          columns={[
            { key: "label", header: "指標", accessor: (r) => r.label },
            { key: "avg", header: "平均", align: "right", render: (r) => formatStat(r.stats.average) },
            { key: "median", header: "中央値", align: "right", render: (r) => formatStat(r.stats.median) },
            { key: "min", header: "最小", align: "right", render: (r) => formatStat(r.stats.min) },
            { key: "max", header: "最大", align: "right", render: (r) => formatStat(r.stats.max) },
            { key: "self", header: "対象ページ", align: "right", render: (r) => formatStat(r.stats.self) },
            { key: "gap", header: "差分", align: "right", render: (r) => formatStat(r.stats.gap) },
          ]}
          rowKey={(r) => r.key}
          minWidth="40rem"
          caption={`統計に使えたページ数: ${diagnosis.stats.charCount.count} 件`}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="上位の傾向">
          {diagnosis.analysis?.serp_trend ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{diagnosis.analysis.serp_trend}</p>
          ) : (
            <p className="text-[13px] text-muted">
              傾向の分析には ANTHROPIC_API_KEY が必要です（測定値の比較は上のとおり表示しています）。
            </p>
          )}
        </Card>
        <Card title="検索意図">
          {diagnosis.analysis?.search_intent ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{diagnosis.analysis.search_intent}</p>
          ) : (
            <p className="text-[13px] text-muted">検索意図の推定には ANTHROPIC_API_KEY が必要です。</p>
          )}
        </Card>
      </div>

      <Card title="SERP フィーチャー" description="検索結果に表示されている枠。実測できたときだけ表示します。">
        {diagnosis.serpSource === "serpapi" ? (
          diagnosis.features.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {diagnosis.features.map((f) => (
                <Badge key={f} tone={f === "ai_overview" ? "info" : "neutral"}>
                  {featureLabel(f)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">この検索結果に特別な枠は検出されませんでした。</p>
          )
        ) : (
          <p className="text-[13px] text-muted">
            推定（Web 検索）では SERP フィーチャーを取得できません。実測するには SERPAPI_KEY を設定してください。
          </p>
        )}

        {diagnosis.relatedQuestions.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[13px] font-bold text-ink">
              関連する質問{diagnosis.serpSource === "web_search" ? "（推定）" : "（他の人はこちらも質問）"}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
              {diagnosis.relatedQuestions.map((q) => (
                <li key={q.question}>{q.question}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
