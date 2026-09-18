"use client";

/**
 * サイトの構成（内部リンク・階層・重要度・ページ種別・鮮度）。
 * サイト診断（A1）の結果に同梱される `structure` を表示する。
 * 数字はすべてクロール結果から計算した実測値（推定・外部 API なし）。
 */
import { HBar, SegmentBar } from "@/components/charts";
import { Badge, Card, DataTable, StatCard, type Column } from "@/components/ui";
import { PAGE_KIND_LABELS, type SiteStructure, type StructurePage } from "@/lib/seo-analysis/types";
import { fmt, pathOf, truncateMiddle } from "@/lib/report";
import { palette } from "@/lib/ui/palette";
import { pct } from "@/lib/report/format";

const DEPTH_LABELS: Record<string, string> = {
  "0": "トップ",
  "1": "1 クリック",
  "2": "2 クリック",
  "3": "3 クリック",
  "4+": "4 クリック以上",
  unreachable: "リンクで到達不可",
};


export function StructureCard({ structure }: { structure: SiteStructure }) {
  const s = structure;
  const kindColors = [palette.chart[0], palette.chart[2], palette.chart[1], palette.chart[3], palette.chart[4], palette.chart[5], palette.secondary, palette.muted, palette.chartTrack, palette.line];

  const pageColumns: Column<StructurePage>[] = [
    {
      key: "url",
      header: "パス",
      sortable: true,
      accessor: (r) => pathOf(r.url),
      render: (r) => (
        <span className="block">
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
            {pathOf(r.url)}
          </a>
          {r.title && <span className="block text-[11px] text-muted">{truncateMiddle(r.title, 40)}</span>}
        </span>
      ),
    },
    {
      key: "kind",
      header: "種別",
      width: "8rem",
      nowrap: true,
      sortable: true,
      accessor: (r) => PAGE_KIND_LABELS[r.kind],
      render: (r) => <span className="text-muted">{PAGE_KIND_LABELS[r.kind]}</span>,
    },
    {
      key: "importance",
      header: "重要度",
      align: "right",
      width: "5rem",
      sortable: true,
      accessor: (r) => r.importance,
      render: (r) => <span className="font-bold tabular-nums text-ink">{r.importance}</span>,
    },
    {
      key: "inlinks",
      header: "被リンク",
      align: "right",
      width: "5rem",
      sortable: true,
      accessor: (r) => r.inlinks,
      render: (r) => <span className="tabular-nums text-muted">{r.inlinks}</span>,
    },
    {
      key: "inContentInlinks",
      header: "うち本文",
      align: "right",
      width: "5rem",
      sortable: true,
      accessor: (r) => r.inContentInlinks,
      render: (r) => (
        <span className={`tabular-nums ${r.inContentInlinks === 0 ? "text-warn" : "text-muted"}`}>{r.inContentInlinks}</span>
      ),
    },
    {
      key: "depth",
      header: "階層",
      align: "right",
      width: "4rem",
      sortable: true,
      accessor: (r) => r.depth ?? 99,
      render: (r) => <span className="tabular-nums text-muted">{r.depth ?? "—"}</span>,
    },
  ];

  return (
    <Card
      title="サイトの構成"
      description="内部リンクの向きだけで見た、ページの重要度と到達しやすさです。ナビ・ヘッダー・フッターのリンクと本文中のリンクを分けて数えています（本文からのリンクが、そのページを重要だと伝える手がかりになります）。"
    >
      <div className="grid gap-3 @2xl:grid-cols-4">
        <StatCard label="内部リンクの延べ本数" value={fmt(s.links.total)} unit="本" hint={`1 ページあたり平均 ${s.links.avgOutlinks} 本`} />
        <StatCard
          label="本文中のリンクの割合"
          value={pct(s.links.inContentShare)}
          hint={s.links.inContentShare < 0.2 ? "ナビ・フッター頼みの構造です" : "本文からの案内があります"}
        />
        <StatCard
          label="本文からの被リンクが無いページ"
          value={fmt(s.links.withoutContentInlinks)}
          unit="ページ"
          hint={`到達不可 ${s.depth.unreachable} / 行き止まり ${s.links.deadEnds.length} / 4 クリック以上 ${s.depth.deep}`}
        />
        <StatCard
          label="リンク先が分からないアンカー"
          value={s.links.anchors.total > 0 ? pct(s.links.anchors.genericShare) : "—"}
          hint={
            s.links.anchors.total > 0
              ? `本文のリンク ${fmt(s.links.anchors.total)} 本中 ${fmt(s.links.anchors.generic)} 本${s.links.anchors.samples.length > 0 ? `（${s.links.anchors.samples.slice(0, 3).join(" / ")}）` : ""}`
              : "本文中のリンクがありません"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 @3xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">トップからのクリック数</h3>
          <HBar
            rows={s.depth.buckets.map((b) => ({
              label: DEPTH_LABELS[b.label] ?? b.label,
              value: b.count,
              color: b.label === "unreachable" ? palette.fail : b.label === "4+" ? palette.warn : palette.chart[0],
            }))}
            max={Math.max(1, ...s.depth.buckets.map((b) => b.count))}
            valueTone="none"
            labelWidth="9rem"
            legend={false}
            ariaLabel="トップからのクリック数の分布"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            検索エンジンも利用者も、トップから 3 クリック以内で着けるページを重要だと見なしやすい傾向があります。
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">ページ種別の構成</h3>
          <SegmentBar
            segments={s.kinds.map((k, i) => ({ label: PAGE_KIND_LABELS[k.kind], value: k.count, color: kindColors[i % kindColors.length] }))}
            ariaLabel="ページ種別の構成"
          />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted">
            <dt>パンくず</dt>
            <dd className="tabular-nums text-ink">
              {s.coverage.breadcrumb.of > 0 ? `${fmt(s.coverage.breadcrumb.count)} / ${fmt(s.coverage.breadcrumb.of)} ページ` : "—"}
            </dd>
            <dt>OG（title・description・image）</dt>
            <dd className="tabular-nums text-ink">{fmt(s.coverage.og.complete)} / {fmt(s.coverage.og.of)} ページ</dd>
            <dt>hreflang</dt>
            <dd className="tabular-nums text-ink">{fmt(s.coverage.hreflang.count)} ページ</dd>
            <dt>被リンクの集中</dt>
            <dd className="tabular-nums text-ink">
              上位 {fmt(s.links.concentration.topPages)} ページに {pct(s.links.concentration.share)}
            </dd>
            <dt>更新日の分かるページ</dt>
            <dd className="tabular-nums text-ink">
              {s.freshness.withDates > 0
                ? `${fmt(s.freshness.withDates)} ページ（${s.freshness.oldest} 〜 ${s.freshness.newest}、1 年以上前 ${fmt(s.freshness.olderThanYear)}）`
                : "無し"}
            </dd>
            <dt>nofollow の内部リンク</dt>
            <dd className="tabular-nums text-ink">{fmt(s.links.nofollow)} 本</dd>
          </dl>
        </div>
      </div>

      {s.weakKeyPages.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-bold text-ink">集客に効くのにリンクが弱いページ</h3>
          <p className="mb-2 text-[12px] leading-relaxed text-muted">
            サービス・問い合わせ・会社情報のページで、本文からの被リンクが 1 本以下のものです。関連する記事や一覧の本文から案内すると、ページの重要度が上がります。
          </p>
          <DataTable rows={s.weakKeyPages} columns={pageColumns} rowKey={(r) => r.url} dense minWidth="40rem" />
        </div>
      )}

      {s.cannibalization.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-bold text-ink">同じ題名のページ（検索意図が重なる候補）</h3>
          <p className="mb-2 text-[12px] leading-relaxed text-muted">
            title または h1 が同じページ同士は、同じ検索語で競合して順位を分け合いがちです。統合するか、狙う語を分けてください。
          </p>
          <ul className="space-y-2 text-[13px]">
            {s.cannibalization.map((g) => (
              <li key={`${g.field}:${g.key}`} className="border-l-2 border-line pl-3">
                <span className="font-bold text-ink">{g.key}</span>
                <Badge tone="neutral" icon={false} className="ml-2">
                  {g.field}
                </Badge>
                <ul className="mt-1 space-y-0.5 text-[12px]">
                  {g.urls.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
                        {pathOf(u)}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-1 text-sm font-bold text-ink">重要度の高いページ</h3>
        <p className="mb-2 text-[12px] leading-relaxed text-muted">
          内部リンクの向きだけで計算した重要度（サイト内で最大のページを 100）です。上位に集客したいページが無ければ、リンクの張り方を見直す余地があります。
        </p>
        <DataTable rows={s.topPages} columns={pageColumns} rowKey={(r) => r.url} dense minWidth="40rem" />
      </div>
    </Card>
  );
}
