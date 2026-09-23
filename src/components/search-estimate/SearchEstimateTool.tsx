"use client";

/**
 * 検索パフォーマンス（推定）の画面。
 *
 * Search Console を連携していなくても、ドメインを入れるだけで
 * 「どのキーワードで何位にいて、どれくらい見られているか」の推定を出す。
 *
 * **実測ではない**ので、そのことを画面の先頭と表の見出しで必ず伝える。
 * 実測は「Google サーチコンソール連携」（2026-09-23 に再開。任意の連携）にある。
 */
import { useState } from "react";
import { useRegisteredSite } from "@/components/site/RegisteredSite";
import {
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  StatCard,
  type Column,
} from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import type { EstimatedRow, SearchEstimate } from "@/lib/search-estimate";
import { useToolRun } from "@/lib/tools/run";

function intText(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString("ja-JP");
}

function percentText(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** 画面の表と CSV で同じ並び・同じ値にする（片方だけ直して食い違うのを防ぐ） */
const FIELDS = [
  { key: "keyword", header: "キーワード", text: (r: EstimatedRow) => r.keyword, sort: (r: EstimatedRow) => r.keyword },
  { key: "rank", header: "順位", text: (r: EstimatedRow) => (r.rank === null ? "圏外" : String(r.rank)), sort: (r: EstimatedRow) => r.rank, align: "right" as const },
  { key: "volume", header: "月間検索数", text: (r: EstimatedRow) => intText(r.monthlyVolume), sort: (r: EstimatedRow) => r.monthlyVolume, align: "right" as const },
  { key: "impressions", header: "推定表示回数", text: (r: EstimatedRow) => intText(r.impressions), sort: (r: EstimatedRow) => r.impressions, align: "right" as const },
  { key: "clicks", header: "推定クリック", text: (r: EstimatedRow) => intText(r.clicks), sort: (r: EstimatedRow) => r.clicks, align: "right" as const },
  { key: "ctr", header: "想定 CTR", text: (r: EstimatedRow) => percentText(r.ctr), sort: (r: EstimatedRow) => r.ctr, align: "right" as const },
  { key: "url", header: "ページ", text: (r: EstimatedRow) => r.url ?? "—", sort: (r: EstimatedRow) => r.url },
] as const;

const COLUMNS: readonly Column<EstimatedRow>[] = FIELDS.map((f) => ({
  key: f.key,
  header: f.header,
  render: (row: EstimatedRow) => f.text(row),
  accessor: (row: EstimatedRow) => f.sort(row),
  align: "align" in f ? f.align : undefined,
  sortable: true,
}));

const CSV_COLUMNS = FIELDS.map((f) => ({ header: f.header, value: (row: EstimatedRow) => f.text(row) }));

export function SearchEstimateTool() {
  // 設定に登録したホームページのドメインを初期値にする（別のドメインを見たいときは書き換えられる）
  const site = useRegisteredSite();
  const [edited, setEdited] = useState<string | null>(null);
  const domain = edited ?? site.domain;
  const setDomain = (value: string) => setEdited(value);
  const { state, run } = useToolRun<SearchEstimate>();
  const running = state.phase === "running";

  async function submit() {
    const value = domain.trim();
    if (!value) return;
    await run("/api/search-estimate", { domain: value });
  }

  const data = state.phase === "done" ? state.data : null;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="これは推定値です">
        <p>
          このドメインが順位を持っているキーワードを集め、順位ごとのクリック率を掛けて
          「どれくらい見られて、どれくらいクリックされているか」を推定しています。
          <strong>Google の実測値ではありません。</strong>
        </p>
        <p className="mt-2">
          対象は Google の通常の検索結果（SEO）です。生成 AI や AI Overviews での引用は「LLMO モニタリング」「AI 検索モニタリング」で見ます。
          実際に検索された語そのもの・実際のクリック数は、SEO の「Google サーチコンソール連携」で Google アカウントを接続すると見られます。
        </p>
      </Callout>

      <Card title="対象">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="ドメイン" hint={site.registered ? "設定に登録したホームページが初期値です。別のドメインも入れられます" : "例: example.jp（https:// や www. は付けても構いません）"} className="min-w-[260px] flex-1">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="example.jp"
              disabled={running}
            />
          </Field>
          <Button onClick={() => void submit()} disabled={running || !domain.trim()}>
            {running ? "取得中…" : "推定する"}
          </Button>
        </div>
      </Card>

      {state.phase === "error" && (
        <Callout tone="fail" title="取得できませんでした">
          {state.message}
        </Callout>
      )}

      {data && (
        <>
          <Card title="サマリー（推定）">
            <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
              <StatCard label="推定クリック数（月）" value={intText(data.clicks)} hint="順位別クリック率から算出" />
              <StatCard label="推定表示回数（月）" value={intText(data.impressions)} hint="月間検索数の合計" />
              <StatCard label="推定 CTR" value={percentText(data.ctr)} />
              <StatCard
                label="平均順位"
                value={data.averageRank === null ? "—" : data.averageRank.toFixed(1)}
                hint="検索数で重み付け。1 に近いほど上位"
              />
            </div>
            <div className="mt-3 grid gap-3 @md:grid-cols-3">
              <StatCard label="3 位以内" value={`${data.top3} 語`} />
              <StatCard label="10 位以内" value={`${data.top10} 語`} />
              <StatCard label="50 位以内" value={`${data.top50} 語`} />
            </div>
            <p className="mt-3 text-[11px] text-muted">
              取得したキーワード {data.keywords.toLocaleString("ja-JP")} 語のうち、月間検索数が分かる{" "}
              {data.counted.toLocaleString("ja-JP")} 語で推定しました。検索数が分からない語は合計に入れていません。
            </p>
          </Card>

          <Card
            title="キーワード別（推定クリックの多い順）"
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(csvFileName(`search-estimate-${data.domain}`, new Date()), CSV_COLUMNS, data.rows)
                }
              >
                CSV
              </Button>
            }
          >
            {data.rows.length === 0 ? (
              <EmptyState title="キーワードがありません" description="このドメインで順位が付いている語が見つかりませんでした。" />
            ) : (
              <DataTable columns={COLUMNS} rows={data.rows} rowKey={(r) => r.keyword} defaultSort={{ key: "clicks", dir: "desc" }} stickyHeader />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
