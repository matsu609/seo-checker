"use client";

/**
 * Google マップ・店舗情報（MEO）。
 *
 * 1. 店名や地域で候補を探し、自社を 1 件、競合を最大 MAX_COMPETITORS 件選ぶ
 * 2. 詳細を取って並べ、自社プロフィールの充実度を採点する
 *
 * 選んだ店舗はブラウザに保存する（他の画面と同じ localStorage）。
 * 取得は POST /api/maps/search と /api/maps/compare。採点はサーバー側の純粋関数。
 */
import { useState } from "react";
import type { MapsCompareItem, MapsCompareResponse } from "@/app/api/maps/compare/route";
import type { MapsSearchResponse } from "@/app/api/maps/search/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { StatStrip } from "@/components/ui/StatCard";
import { MAX_COMPETITORS, type PlaceSummary } from "@/lib/maps/types";
import { useStore } from "@/lib/store/hooks";
import { mapsSelectionStore, selectOwn, toggleCompetitor, type PlaceRef } from "@/lib/store/maps";
import { useToolRun } from "@/lib/tools/run";
import { formatCount, formatRating, hostOf, statusLabel } from "./format";
import { ProfileChecklist } from "./ProfileChecklist";

export function MapsTool() {
  const [selection, setSelection] = useStore(mapsSelectionStore);
  const [query, setQuery] = useState(selection.query);
  const search = useToolRun<MapsSearchResponse>();
  const compare = useToolRun<MapsCompareResponse>();

  const own = selection.own;
  const competitorIds = new Set(selection.competitors.map((c) => c.id));

  async function onSearch() {
    const q = query.trim();
    if (!q) return;
    setSelection((prev) => ({ ...prev, query: q }));
    await search.run("/api/maps/search", { query: q });
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
    { key: "score", header: "充実度", align: "right", accessor: (r) => r.score.score, sortable: true, render: (r) => <span className="font-bold tabular-nums">{r.score.score}</span> },
    { key: "rating", header: "評価", align: "right", accessor: (r) => r.detail.rating, sortable: true, render: (r) => formatRating(r.detail.rating) },
    { key: "reviews", header: "口コミ", align: "right", accessor: (r) => r.detail.ratingCount, sortable: true, render: (r) => formatCount(r.detail.ratingCount) },
    { key: "photos", header: "写真", align: "right", accessor: (r) => r.detail.photoCount, sortable: true, render: (r) => `${r.detail.photoCount}${r.detail.photoCount >= 10 ? "+" : ""}` },
    { key: "hours", header: "営業時間", align: "center", render: (r) => (r.detail.hours.length > 0 ? "あり" : "なし") },
    { key: "phone", header: "電話", align: "center", render: (r) => (r.detail.phone ? "あり" : "なし") },
    { key: "website", header: "サイト", render: (r) => (r.detail.website ? <a href={r.detail.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{hostOf(r.detail.website)}</a> : "なし") },
    { key: "status", header: "状態", render: (r) => statusLabel(r.detail.status), nowrap: true },
  ];

  const ownResult = compare.state.phase === "done" ? compare.state.data.results.find((r) => r.placeId === own?.id) ?? null : null;

  return (
    <div className="space-y-6">
      <Card number={1} title="店舗を探す" description="店名と地域（例: 渋谷 美容室 ○○）で検索し、自社を 1 件、比較したい競合を最大 5 件まで選びます。">
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
          {own ? (
            <Badge tone="info" icon={false}>{own.name}</Badge>
          ) : (
            <span className="text-muted">未選択</span>
          )}
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
        title="比較と採点"
        description="Google マップ上の公開情報を並べ、自社プロフィールの充実度を採点します。口コミは Google が返す最大 5 件です。"
        actions={
          <Button onClick={() => void onCompare()} loading={compare.state.phase === "running"} disabled={!own}>
            比較する
          </Button>
        }
      >
        {!own && compare.state.phase === "idle" && (
          <EmptyState title="自社の店舗を選んでください" description="上の検索結果で「自社にする」を押すと比較できます。" />
        )}

        {compare.state.phase === "error" && (
          <Callout tone="fail" title="取得できませんでした">
            {compare.state.message}
          </Callout>
        )}

        {compare.state.phase === "done" && (
          <div className="space-y-6">
            {ownResult && (
              <StatStrip
                items={[
                  { label: "充実度スコア", value: ownResult.score.score, unit: "/ 100" },
                  { label: "評価", value: formatRating(ownResult.detail.rating) },
                  { label: "口コミ", value: formatCount(ownResult.detail.ratingCount), unit: "件" },
                  { label: "写真", value: ownResult.detail.photoCount >= 10 ? "10+" : ownResult.detail.photoCount, unit: "枚" },
                ]}
              />
            )}

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

            {ownResult && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-ink">自社プロフィールの改善点</h3>
                <ProfileChecklist checks={ownResult.score.checks} />
              </section>
            )}

            {ownResult && ownResult.detail.reviews.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-ink">自社の最近の口コミ</h3>
                <ul className="divide-y divide-line border-y border-line">
                  {ownResult.detail.reviews.map((r, i) => (
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
              </section>
            )}

            <p className="text-[11px] text-muted">
              データ: Google Places API（Google マップ上の公開情報）。
              {ownResult?.detail.mapsUrl && (
                <>
                  {" "}
                  <a href={ownResult.detail.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    Google マップで自社を見る ↗
                  </a>
                </>
              )}
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
