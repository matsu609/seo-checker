"use client";

/**
 * A2 / A3 ページ最適化レポートの画面。
 *
 * 外部連携なしで最後まで動く。PAGESPEED_API_KEY は「あれば表示速度の取得が
 * 安定する」だけで、未設定でも取得を試み、失敗したらその旨だけを出す。
 */
import { useCallback, useMemo, useState } from "react";
import { Donut, HBar } from "@/components/charts";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  StatStrip,
  Tabs,
  type Column,
  type TabItem,
} from "@/components/ui";
import { SECTION_LABELS, type SectionId } from "@/lib/page-report/config";
import { pageReportFormStore } from "@/lib/page-report/store";
import type { JsonLdNode, PageReport, ReportRow, ReportSection } from "@/lib/page-report/types";
import { csvFileName, downloadCsv, type CsvColumn } from "@/lib/export/csv";
import { fmt, formatDateTime, hostOf } from "@/lib/report";
import { useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { gradeOf } from "@/lib/ui/grade";
import { palette } from "@/lib/ui/palette";
import { BotMatrix } from "./BotMatrix";
import { PsiPanel } from "./PsiPanel";
import { SectionTables } from "./SectionTable";

type TabId = "meta" | "robots" | "structured" | "speed";

const TAB_SECTIONS: Record<Exclude<TabId, "speed">, SectionId[]> = {
  meta: ["head", "headings", "content", "semantic", "internalLinks", "images"],
  robots: ["robots"],
  structured: ["structuredData"],
};

interface CsvRow extends ReportRow {
  section: string;
}

const CSV_COLUMNS: CsvColumn<CsvRow>[] = [
  { header: "セクション", value: (r) => r.section },
  { header: "評価項目", value: (r) => r.item },
  { header: "ステータス", value: (r) => r.status },
  { header: "内容", value: (r) => r.content },
  { header: "備考", value: (r) => r.note },
];

const JSONLD_COLUMNS: Column<JsonLdNode>[] = [
  {
    key: "type",
    header: "@type",
    width: "12rem",
    render: (r) => <code className="font-mono text-[12px] text-ink">{r.type}</code>,
  },
  {
    key: "missing",
    header: "必須プロパティ",
    width: "10rem",
    nowrap: true,
    render: (r) =>
      r.missing.length === 0 ? <Badge tone="pass">充足</Badge> : <Badge tone="fail">{r.missing.join(" / ")}</Badge>,
  },
  {
    key: "properties",
    header: "設定されているプロパティ",
    render: (r) => <span className="break-all text-muted">{r.properties.join(", ") || "—"}</span>,
  },
];

export function PageReportView() {
  const [form, setForm] = useStore(pageReportFormStore);
  const { status } = useIntegrations();
  const { state, run, cancel } = useToolRun<{ report: PageReport; cached: boolean }>();
  const [tab, setTab] = useState<TabId>("meta");

  const report = state.phase === "done" ? state.data.report : null;
  const cached = state.phase === "done" ? state.data.cached : false;
  const running = state.phase === "running";

  const submit = useCallback(
    (refresh: boolean) => {
      const url = form.url.trim();
      if (!url) return;
      void run("/api/page-report", {
        url,
        psi: form.psi,
        strategy: form.strategy,
        ...(refresh ? { refresh: true } : {}),
      });
    },
    [form.url, form.psi, form.strategy, run],
  );

  const csvRows = useMemo<CsvRow[]>(
    () =>
      report
        ? report.sections.flatMap((section) =>
            section.rows.map((row) => ({ ...row, section: section.label })),
          )
        : [],
    [report],
  );

  const counts = useMemo(() => {
    const rows = report?.sections.flatMap((s) => s.rows) ?? [];
    return {
      total: rows.length,
      good: rows.filter((r) => r.status === "適切").length,
      fair: rows.filter((r) => r.status === "良好").length,
      poor: rows.filter((r) => r.status === "要改善").length,
    };
  }, [report]);

  const tabs: TabItem<TabId>[] = [
    { id: "meta", label: "メタタグ・見出し" },
    { id: "robots", label: "robots・llms" },
    { id: "structured", label: "構造化データ" },
    { id: "speed", label: "表示速度・Core Web Vitals" },
  ];

  return (
    <>
      <Card
        className="mb-6"
        title="診断するページ"
        description="1 ページの AI フレンドリー度を 0〜100 点で評価します。本文抽出・見出し・構造化データ・robots.txt の AI クローラ判定まで、外部 API なしで診断できます。"
      >
        <form
          className="grid gap-3 @2xl:grid-cols-[1fr_10rem_auto] @2xl:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <Field label="ページの URL" htmlFor="report-url" required hint="トップページでも下層ページでも診断できます">
            <Input
              id="report-url"
              value={form.url}
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.co.jp/service/"
              disabled={running}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </Field>
          <Field label="計測デバイス" htmlFor="report-strategy" hint="表示速度の計測条件">
            <Select
              id="report-strategy"
              value={form.strategy}
              disabled={running || !form.psi}
              onChange={(e) => setForm({ ...form, strategy: e.target.value === "desktop" ? "desktop" : "mobile" })}
            >
              <option value="mobile">モバイル</option>
              <option value="desktop">デスクトップ</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="lg" loading={running} className="w-full @2xl:w-auto">
              レポートを作成
            </Button>
            {running && (
              <Button variant="secondary" size="lg" onClick={cancel}>
                中止
              </Button>
            )}
          </div>
        </form>

        <label className="mt-3 flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={form.psi}
            disabled={running}
            onChange={(e) => setForm({ ...form, psi: e.target.checked })}
          />
          <span>
            表示速度も測定する（PageSpeed Insights）
            <span className="ml-1 text-muted">
              — 計測に 30 秒ほどかかります。
              {status && !status.pagespeed && (
                <>
                  {" "}
                  <code className="font-mono text-[12px]">PAGESPEED_API_KEY</code> が未設定のため呼び出し上限が厳しく、
                  取得できないことがあります（他の項目には影響しません）。
                </>
              )}
            </span>
          </span>
        </label>
      </Card>

      {state.phase === "error" && (
        <Callout tone="fail" title="レポートを作成できませんでした" className="mb-6">
          {state.message}
        </Callout>
      )}

      {!report && !running && (
        <EmptyState
          title="まだ診断していません"
          description="URL を入れて「レポートを作成」を押すと、項目ごとの評価と改善提案を表にまとめます。"
        />
      )}

      {report && (
        <div className="space-y-6">
          {cached && (
            <p className="text-[12px] text-muted">
              直近の結果を表示しています（サーバーのキャッシュ）。取り直すには「再取得」を押してください。
            </p>
          )}

          <Card
            title="総合評価"
            description="項目ごとの判定を配点で加重平均した値です。"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => submit(true)} disabled={running}>
                  再取得
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCsv(csvFileName(`page-report_${hostOf(report.finalUrl)}`, new Date()), CSV_COLUMNS, csvRows)
                  }
                >
                  CSV をダウンロード
                </Button>
              </div>
            }
          >
            <div className="grid gap-6 @3xl:grid-cols-[11rem_1fr]">
              <div className="flex flex-col items-center">
                <Donut
                  value={report.score}
                  ariaLabel={`AI フレンドリー度 ${report.score} / 100`}
                  sublabel="/100"
                />
                <p className="mt-2 text-sm font-bold" style={{ color: gradeOf(report.score).color }}>
                  {report.scoreLabel}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">判定: 80 以上 = 良好 / 60〜79 = 改善余地あり / 60 未満 = 要改善</p>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-sm font-bold text-ink">総評</h3>
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink">
                  {report.summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-muted">※ ルールに基づく自動生成（AI は使っていません）</p>

                <h3 className="mt-5 mb-2 text-sm font-bold text-ink">優先対応</h3>
                {report.priorities.length === 0 ? (
                  <p className="text-[13px] text-muted">改善が必要な項目はありません。</p>
                ) : (
                  <ol className="space-y-2">
                    {report.priorities.map((p, i) => (
                      <li key={p.title} className="grid grid-cols-[1.5rem_1fr] gap-2 text-[13px] leading-relaxed">
                        <span className="font-bold tabular-nums text-accent">{i + 1}.</span>
                        <span className="min-w-0">
                          <span className="font-bold text-ink">{p.title}</span>
                          <span className="ml-1 text-muted">{p.why}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <StatStrip
              className="mt-6"
              items={[
                { label: "評価項目", value: fmt(counts.total) },
                { label: "適切", value: fmt(counts.good) },
                { label: "良好", value: fmt(counts.fair) },
                { label: "要改善", value: fmt(counts.poor) },
              ]}
            />

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold text-ink">セクション別の得点</h3>
              <HBar
                rows={report.sections.map((s) => ({
                  label: s.label,
                  value: s.points,
                  max: s.weight,
                  color: palette.chart[0],
                  valueLabel: `${s.points}/${s.weight}`,
                }))}
                max={20}
                valueTone="none"
                labelWidth="9rem"
                legend={false}
                ariaLabel="セクション別の得点"
              />
              <p className="mt-2 text-[11px] text-muted">
                配点: {report.sections.map((s) => `${SECTION_LABELS[s.id]} ${s.weight}`).join(" / ")}
              </p>
            </div>
          </Card>

          <Card
            title="ページの情報"
            description="診断対象と取得時の状態です。"
          >
            <dl className="grid gap-x-6 gap-y-2 text-[13px] @2xl:grid-cols-2">
              <Item label="診断した URL" value={<span className="break-all">{report.finalUrl}</span>} />
              <Item label="診断日時" value={formatDateTime(report.fetchedAt)} />
              <Item label="HTTP ステータス" value={String(report.status)} />
              <Item label="本文の文字数" value={`${fmt(report.measurements.mainTextChars)} 文字`} />
              <Item
                label="JSON-LD の @type"
                value={report.measurements.jsonLd.types.join(", ") || "なし"}
              />
              <Item label="見出しの数" value={`${report.measurements.headings.length} 個（h1 は ${report.measurements.h1Count} 個）`} />
            </dl>
            {report.notes.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[12px] text-muted">
                {report.notes.map((note) => (
                  <li key={note}>※ {note}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="項目別の評価" padding="md">
            <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="レポートの表示切り替え" className="mb-5" />

            {tab !== "speed" && <SectionTables sections={sectionsFor(report, tab)} />}

            {tab === "robots" && (
              <div className="mt-8">
                <h3 className="mb-2 text-sm font-bold text-ink">AI クローラごとの判定</h3>
                <BotMatrix robots={report.robots} />
              </div>
            )}

            {tab === "structured" && (
              <div className="mt-8">
                <h3 className="mb-2 text-sm font-bold text-ink">検出した構造化データ</h3>
                <DataTable
                  rows={report.measurements.jsonLd.nodes}
                  columns={JSONLD_COLUMNS}
                  rowKey={(r) => r.type}
                  dense
                  minWidth="38rem"
                  emptyText="JSON-LD が見つかりませんでした。"
                />
              </div>
            )}

            {tab === "meta" && report.measurements.headings.length > 0 && (
              <div className="mt-8">
                <h3 className="mb-2 text-sm font-bold text-ink">見出しの構造</h3>
                <ul className="space-y-1 text-[13px]">
                  {report.measurements.headings.map((h, i) => (
                    <li key={`${i}-${h.text}`} style={{ paddingLeft: `${(h.level - 1) * 1.25}rem` }}>
                      <Badge tone="id">h{h.level}</Badge>
                      <span className="ml-2 text-ink">{h.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "speed" && <PsiPanel psi={report.psi} error={report.psiError} requested={form.psi} />}
          </Card>
        </div>
      )}
    </>
  );
}

function sectionsFor(report: PageReport, tab: Exclude<TabId, "speed">): ReportSection[] {
  const ids = TAB_SECTIONS[tab];
  return ids.map((id) => report.sections.find((s) => s.id === id)).filter((s): s is ReportSection => Boolean(s));
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-b border-line py-1.5">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}
