"use client";

/**
 * Google マップ・店舗情報（MEO）。
 *
 * 1. 店名や地域で候補を探し、自社を 1 件、競合を最大 MAX_COMPETITORS 件選ぶ
 * 2. 自社の診断レポート（4 カテゴリの採点・総評・口コミ情報）を作り、PDF に出す
 * 3. 競合と並べて比較する
 *
 * 選んだ店舗はブラウザに保存する（他の画面と同じ localStorage）。
 * 取得は /api/maps/*。採点はサーバー側の純粋関数。AI 総評は任意（キーがあるときだけ）。
 */
import { useEffect, useRef, useState } from "react";
import type { MapsCommentaryResponse } from "@/app/api/maps/commentary/route";
import type { MapsCompareItem, MapsCompareResponse } from "@/app/api/maps/compare/route";
import type { MapsReportResponse } from "@/app/api/maps/report/route";
import type { MapsSearchResponse } from "@/app/api/maps/search/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { toCommentaryInput } from "@/lib/maps/commentary-input";
import { meoReportFileName } from "@/lib/maps/report";
import { MAX_COMPETITORS, type PlaceSummary } from "@/lib/maps/types";
import { downloadPdf } from "@/lib/pdf/download";
import { useStore } from "@/lib/store/hooks";
import { mapsSelectionStore, selectOwn, toggleCompetitor, type PlaceRef } from "@/lib/store/maps";
import { useToolRun } from "@/lib/tools/run";
import { formatCount, formatRating, hostOf, statusLabel } from "./format";
import { MeoReportView } from "./report/MeoReportView";

type PdfState = "idle" | "working" | "failed";

export function MapsTool() {
  const [selection, setSelection] = useStore(mapsSelectionStore);
  const [query, setQuery] = useState(selection.query);
  const search = useToolRun<MapsSearchResponse>();
  const report = useToolRun<MapsReportResponse>();
  const commentary = useToolRun<MapsCommentaryResponse>();
  const compare = useToolRun<MapsCompareResponse>();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [pdf, setPdf] = useState<PdfState>("idle");
  const reportRef = useRef<HTMLDivElement>(null);

  const own = selection.own;
  const competitorIds = new Set(selection.competitors.map((c) => c.id));

  // AI 総評のボタンを出すかどうか（キーの有無だけを聞く）
  useEffect(() => {
    let alive = true;
    fetch("/api/maps/commentary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((b: { enabled?: boolean }) => {
        if (alive) setAiEnabled(b.enabled === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function onSearch() {
    const q = query.trim();
    if (!q) return;
    setSelection((prev) => ({ ...prev, query: q }));
    await search.run("/api/maps/search", { query: q });
  }

  async function onReport(refresh = false) {
    if (!own) return;
    commentary.reset();
    setPdf("idle");
    await report.run("/api/maps/report", { placeId: own.id, refresh });
  }

  async function onCommentary() {
    if (report.state.phase !== "done") return;
    const { detail, score } = report.state.data.report;
    await commentary.run("/api/maps/commentary", { input: toCommentaryInput(detail, score) });
  }

  async function onDownloadPdf() {
    const element = reportRef.current;
    if (!element || report.state.phase !== "done") return;
    setPdf("working");
    try {
      await downloadPdf({ element, fileName: meoReportFileName(report.state.data.report) });
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }

  async function onCompare(refresh = false) {
    if (!own) return;
    await compare.run("/api/maps/compare", {
      placeIds: [own.id, ...selection.competitors.map((c) => c.id)],
      refresh,
    });
  }

  const ref = (p: PlaceSummary): PlaceRef => ({ id: p.id, name: p.name });

  const searchColumns: Column<PlaceSummary>[] = [
    {
      key: "name",
      header: "店舗",
      render: (p) => (
        <div className="min-w-0">
          <div className="font-bold text-ink">{p.name}</div>
          {p.address && <div className="text-[12px] text-muted">{p.address}</div>}
        </div>
      ),
    },
    { key: "category", header: "カテゴリ", accessor: (p) => p.category ?? "", render: (p) => p.category ?? "—", nowrap: true },
    {
      key: "rating",
      header: "評価",
      align: "right",
      accessor: (p) => p.rating,
      sortable: true,
      render: (p) => (
        <span className="tabular-nums">
          {formatRating(p.rating)}
          <span className="ml-1 text-[12px] text-muted">({formatCount(p.ratingCount)})</span>
        </span>
      ),
    },
    { key: "status", header: "状態", render: (p) => statusLabel(p.status), nowrap: true },
    {
      key: "select",
      header: "選ぶ",
      nowrap: true,
      render: (p) => {
        const isOwn = own?.id === p.id;
        const isCompetitor = competitorIds.has(p.id);
        const full = selection.competitors.length >= MAX_COMPETITORS;
        return (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={isOwn ? "primary" : "secondary"}
              onClick={() => setSelection((prev) => selectOwn(prev, ref(p)))}
              disabled={isOwn}
            >
              {isOwn ? "自社" : "自社にする"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelection((prev) => toggleCompetitor(prev, ref(p)))}
              disabled={isOwn || (!isCompetitor && full)}
            >
              {isCompetitor ? "競合から外す" : "競合に追加"}
            </Button>
          </div>
        );
      },
    },
  ];

  const compareColumns: Column<MapsCompareItem>[] = [
    {
      key: "name",
      header: "店舗",
      render: (r) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-bold text-ink">
            {r.placeId === own?.id && <Badge tone="info" icon={false}>自社</Badge>}
            {r.detail.name}
          </div>
          {r.detail.category && <div className="text-[12px] text-muted">{r.detail.category}</div>}
        </div>
      ),
    },
    {
      key: "score",
      header: "充実度",
      align: "right",
      accessor: (r) => r.score.score,
      sortable: true,
      render: (r) => <span className="font-bold tabular-nums">{r.score.score ?? "—"}</span>,
    },
    { key: "rating", header: "評価", align: "right", accessor: (r) => r.detail.rating, sortable: true, render: (r) => formatRating(r.detail.rating) },
    { key: "reviews", header: "口コミ", align: "right", accessor: (r) => r.detail.ratingCount, sortable: true, render: (r) => formatCount(r.detail.ratingCount) },
    { key: "photos", header: "写真", align: "right", accessor: (r) => r.detail.photoCount, sortable: true, render: (r) => `${r.detail.photoCount}${r.detail.photoCount >= 10 ? "+" : ""}` },
    { key: "hours", header: "営業時間", align: "center", render: (r) => (r.detail.hours.length > 0 ? "あり" : "なし") },
    { key: "phone", header: "電話", align: "center", render: (r) => (r.detail.phone ? "あり" : "なし") },
    {
      key: "website",
      header: "サイト",
      render: (r) =>
        r.detail.website ? (
          <a href={r.detail.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {hostOf(r.detail.website)}
          </a>
        ) : (
          "なし"
        ),
    },
    { key: "status", header: "状態", render: (r) => statusLabel(r.detail.status), nowrap: true },
  ];

  return (
    <div className="space-y-6">
      <Card
        number={1}
        title="店舗を探す"
        description="店名と地域（例: 渋谷 美容室 ○○）で検索し、自社を 1 件、比較したい競合を最大 5 件まで選びます。"
        className="no-print"
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void onSearch();
          }}
        >
          <Field label="店名・地域" className="min-w-64 flex-1">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="渋谷 美容室" maxLength={200} />
          </Field>
          <Button type="submit" loading={search.state.phase === "running"} disabled={!query.trim()}>
            検索
          </Button>
        </form>

        {search.state.phase === "error" && (
          <Callout tone="fail" title="検索できませんでした" className="mt-4">
            {search.state.message}
          </Callout>
        )}

        {search.state.phase === "done" && (
          <div className="mt-4">
            <DataTable
              rows={search.state.data.places}
              columns={searchColumns}
              rowKey={(p) => p.id}
              dense
              minWidth="48rem"
              emptyText="該当する店舗が見つかりませんでした。地域名や表記を変えて検索してください。"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">自社:</span>
          {own ? <Badge tone="info" icon={false}>{own.name}</Badge> : <span className="text-muted">未選択</span>}
          <span className="ml-3 text-muted">
            競合 ({selection.competitors.length}/{MAX_COMPETITORS}):
          </span>
          {selection.competitors.length === 0 && <span className="text-muted">なし</span>}
          {selection.competitors.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelection((prev) => toggleCompetitor(prev, c))}
              title="競合から外す"
              className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-ink hover:bg-panel"
            >
              {c.name} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      </Card>

      <Card
        number={2}
        title="診断レポート（自社）"
        description="Google マップ上の公開情報から、基本情報・投稿・写真・レビューの 4 カテゴリで採点します。オーナー権限が要る項目は「未取得」として採点から外します。"
        actions={
          <Button onClick={() => void onReport()} loading={report.state.phase === "running"} disabled={!own}>
            {report.state.phase === "done" ? "作り直す" : "レポートを作成"}
          </Button>
        }
        padding="sm"
      >
        {!own && report.state.phase === "idle" && (
          <EmptyState title="自社の店舗を選んでください" description="上の検索結果で「自社にする」を押すとレポートを作れます。" />
        )}

        {report.state.phase === "error" && (
          <Callout tone="fail" title="レポートを作成できませんでした">
            {report.state.message}
          </Callout>
        )}

        {report.state.phase === "done" && (
          <>
            <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              {commentary.state.phase === "error" && (
                <span className="text-[13px] text-fail">{commentary.state.message}</span>
              )}
              {pdf === "failed" && <span className="text-[13px] text-fail">PDF を作成できませんでした</span>}
              {report.state.data.cached && (
                <button type="button" onClick={() => void onReport(true)} className="text-[13px] text-muted underline underline-offset-2">
                  最新の情報を取り直す
                </button>
              )}
              {aiEnabled && commentary.state.phase !== "done" && (
                <Button variant="secondary" size="sm" onClick={() => void onCommentary()} loading={commentary.state.phase === "running"}>
                  AI 総評を生成
                </Button>
              )}
              <Button size="sm" onClick={() => void onDownloadPdf()} loading={pdf === "working"}>
                PDF でダウンロード
              </Button>
            </div>
            <div ref={reportRef}>
              <MeoReportView
                report={report.state.data.report}
                aiCommentary={commentary.state.phase === "done" ? commentary.state.data.paragraphs : null}
              />
            </div>
          </>
        )}
      </Card>

      <Card
        number={3}
        title="競合との比較"
        description="自社と競合を並べます。口コミは Google が返す最大 5 件です。"
        actions={
          <Button onClick={() => void onCompare()} loading={compare.state.phase === "running"} disabled={!own} variant="secondary">
            比較する
          </Button>
        }
        className="no-print"
      >
        {!own && compare.state.phase === "idle" && (
          <EmptyState title="自社の店舗を選んでください" description="競合を追加してから「比較する」を押します。" />
        )}

        {compare.state.phase === "error" && (
          <Callout tone="fail" title="取得できませんでした">
            {compare.state.message}
          </Callout>
        )}

        {compare.state.phase === "done" && (
          <div className="space-y-4">
            <DataTable
              rows={compare.state.data.results}
              columns={compareColumns}
              rowKey={(r) => r.placeId}
              defaultSort={{ key: "score", dir: "desc" }}
              rowClassName={(r) => (r.placeId === own?.id ? "bg-accent-soft" : undefined)}
              minWidth="56rem"
              emptyText="表示できる店舗がありません。"
            />
            {compare.state.data.missing.length > 0 && (
              <Callout tone="warn" title="見つからなかった店舗があります">
                {compare.state.data.missing.length} 件は Google マップ上で見つかりませんでした（閉業で削除された可能性があります）。検索し直して選び直してください。
              </Callout>
            )}
            <p className="text-[11px] text-muted">
              データ: Google Places API。
              {compare.state.data.cached && (
                <>
                  {" "}
                  <button type="button" onClick={() => void onCompare(true)} className="underline underline-offset-2">
                    最新の情報を取り直す
                  </button>
                </>
              )}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
