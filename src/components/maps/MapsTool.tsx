"use client";

/**
 * Google マップ・店舗情報（MEO）。
 *
 * 1. 店名や地域で候補を探し、自社を 1 件、競合を最大 MAX_COMPETITORS 件選ぶ
 * 2. 自社の診断レポート（4 カテゴリの採点・総評・口コミ情報）を作り、PDF に出す
 * 3. 保存した報告書の履歴（Supabase が設定されているときだけ）
 * 4. 競合と並べて比較する
 *
 * 選んだ店舗はブラウザに保存する（他の画面と同じ localStorage）。報告書の保存だけサーバー（Supabase）。
 * 取得は /api/maps/*。採点はサーバー側の純粋関数。AI 総評は任意（キーがあるときだけ）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapsCommentaryResponse } from "@/app/api/maps/commentary/route";
import type { MapsCompareItem, MapsCompareResponse } from "@/app/api/maps/compare/route";
import type { MapsHistoryEntryResponse } from "@/app/api/maps/history/[id]/route";
import type { MapsHistoryListResponse, MapsHistorySaveResponse } from "@/app/api/maps/history/route";
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
import type { MeoHistoryItem, SavedMeoReport } from "@/lib/maps/history";
import { meoReportFileName, type MeoReport } from "@/lib/maps/report";
import { MAX_COMPETITORS, type PlaceSummary } from "@/lib/maps/types";
import { downloadPdf } from "@/lib/pdf/download";
import { formatDateTime } from "@/lib/report/format";
import { useStore } from "@/lib/store/hooks";
import { mapsSelectionStore, selectOwn, toggleCompetitor, type PlaceRef } from "@/lib/store/maps";
import { useToolRun } from "@/lib/tools/run";
import { formatCount, formatRating, hostOf, statusLabel } from "./format";
import { MeoHistoryCard } from "./MeoHistoryCard";
import { MeoReportView } from "./report/MeoReportView";

type PdfState = "idle" | "working" | "failed";
type SaveState = { phase: "idle" } | { phase: "working" } | { phase: "saved"; id: string } | { phase: "failed"; message: string };

interface HistoryState {
  /** Supabase が設定されているか（false ならカードごと出さない） */
  enabled: boolean;
  items: MeoHistoryItem[];
  loading: boolean;
  error: string | null;
}

/** 履歴から開いた報告書（報告書欄に、作りたての報告書の代わりに出す） */
interface Opened {
  id: string;
  report: SavedMeoReport;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

export function MapsTool() {
  const [selection, setSelection] = useStore(mapsSelectionStore);
  const [query, setQuery] = useState(selection.query);
  const search = useToolRun<MapsSearchResponse>();
  const report = useToolRun<MapsReportResponse>();
  const commentary = useToolRun<MapsCommentaryResponse>();
  const compare = useToolRun<MapsCompareResponse>();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [pdf, setPdf] = useState<PdfState>("idle");
  const [save, setSave] = useState<SaveState>({ phase: "idle" });
  const [history, setHistory] = useState<HistoryState>({ enabled: false, items: [], loading: false, error: null });
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const own = selection.own;
  const ownId = own?.id ?? null;
  const competitorIds = new Set(selection.competitors.map((c) => c.id));

  // 保存済みの報告書一覧。店舗を変えたら取り直す。Supabase 未設定なら enabled: false が返る
  const loadHistory = useCallback(async (placeId: string | null, signal?: AbortSignal) => {
    setHistory((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = placeId ? `/api/maps/history?placeId=${encodeURIComponent(placeId)}` : "/api/maps/history";
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsHistoryListResponse;
      setHistory({ enabled: body.enabled, items: body.enabled ? body.items : [], loading: false, error: null });
    } catch (err) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : "履歴を読み込めませんでした";
      setHistory((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadHistory(ownId, ac.signal);
    return () => ac.abort();
  }, [ownId, loadHistory]);

  // 店舗を変えたら、開いていた履歴と保存状態は捨てる
  useEffect(() => {
    setOpened(null);
    setSave({ phase: "idle" });
  }, [ownId]);

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
    setSave({ phase: "idle" });
    setOpened(null);
    await report.run("/api/maps/report", { placeId: own.id, refresh });
  }

  async function onSave() {
    if (!own || report.state.phase !== "done" || opened) return;
    setSave({ phase: "working" });
    try {
      const res = await fetch("/api/maps/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          placeId: own.id,
          aiCommentary: commentary.state.phase === "done" ? commentary.state.data.paragraphs : undefined,
        }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsHistorySaveResponse;
      setSave({ phase: "saved", id: body.item.id });
      setHistory((prev) => ({ ...prev, items: [body.item, ...prev.items.filter((i) => i.id !== body.item.id)] }));
    } catch (err) {
      setSave({ phase: "failed", message: err instanceof Error ? err.message : "保存できませんでした" });
    }
  }

  async function onOpenHistory(item: MeoHistoryItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/maps/history/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsHistoryEntryResponse;
      setOpened({ id: body.item.id, report: body.report });
      setPdf("idle");
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setHistory((prev) => ({ ...prev, error: err instanceof Error ? err.message : "報告書を開けませんでした" }));
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteHistory(item: MeoHistoryItem) {
    if (!window.confirm(`${formatDateTime(item.generatedAt)} の報告書を削除します。元に戻せません。よろしいですか？`)) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/maps/history/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
      setHistory((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== item.id), error: null }));
      if (opened?.id === item.id) setOpened(null);
      if (save.phase === "saved" && save.id === item.id) setSave({ phase: "idle" });
    } catch (err) {
      setHistory((prev) => ({ ...prev, error: err instanceof Error ? err.message : "削除できませんでした" }));
    } finally {
      setBusyId(null);
    }
  }

  async function onCommentary() {
    if (report.state.phase !== "done" || opened) return;
    const { detail, score } = report.state.data.report;
    await commentary.run("/api/maps/commentary", { input: toCommentaryInput(detail, score) });
  }

  // 報告書欄に出すもの: 履歴から開いたもの > 作りたてのもの
  const shown: { report: MeoReport; aiCommentary: string[] | null; fromHistory: boolean } | null = opened
    ? { report: opened.report, aiCommentary: opened.report.aiCommentary, fromHistory: true }
    : report.state.phase === "done"
      ? {
          report: report.state.data.report,
          aiCommentary: commentary.state.phase === "done" ? commentary.state.data.paragraphs : null,
          fromHistory: false,
        }
      : null;

  async function onDownloadPdf() {
    const element = reportRef.current;
    if (!element || !shown) return;
    setPdf("working");
    try {
      await downloadPdf({ element, fileName: meoReportFileName(shown.report) });
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
            {shown ? "作り直す" : "レポートを作成"}
          </Button>
        }
        padding="sm"
      >
        {!own && report.state.phase === "idle" && !shown && (
          <EmptyState title="自社の店舗を選んでください" description="上の検索結果で「自社にする」を押すとレポートを作れます。" />
        )}

        {report.state.phase === "error" && !shown && (
          <Callout tone="fail" title="レポートを作成できませんでした">
            {report.state.message}
          </Callout>
        )}

        {shown && (
          <>
            {shown.fromHistory && (
              <Callout tone="info" title="保存済みの報告書を表示しています" className="no-print mb-3">
                {formatDateTime(shown.report.generatedAt)} に保存したものです。いまの状態で診断し直すには「作り直す」を押してください。
              </Callout>
            )}
            <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              {commentary.state.phase === "error" && !shown.fromHistory && (
                <span className="text-[13px] text-fail">{commentary.state.message}</span>
              )}
              {save.phase === "failed" && <span className="text-[13px] text-fail">{save.message}</span>}
              {pdf === "failed" && <span className="text-[13px] text-fail">PDF を作成できませんでした</span>}
              {!shown.fromHistory && report.state.phase === "done" && report.state.data.cached && (
                <button type="button" onClick={() => void onReport(true)} className="text-[13px] text-muted underline underline-offset-2">
                  最新の情報を取り直す
                </button>
              )}
              {aiEnabled && !shown.fromHistory && commentary.state.phase !== "done" && (
                <Button variant="secondary" size="sm" onClick={() => void onCommentary()} loading={commentary.state.phase === "running"}>
                  AI 総評を生成
                </Button>
              )}
              {history.enabled && !shown.fromHistory && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onSave()}
                  loading={save.phase === "working"}
                  disabled={save.phase === "saved"}
                >
                  {save.phase === "saved" ? "保存済み" : "保存"}
                </Button>
              )}
              <Button size="sm" onClick={() => void onDownloadPdf()} loading={pdf === "working"}>
                PDF でダウンロード
              </Button>
            </div>
            <div ref={reportRef}>
              <MeoReportView report={shown.report} aiCommentary={shown.aiCommentary} />
            </div>
          </>
        )}
      </Card>

      {history.enabled && (
        <MeoHistoryCard
          number={3}
          placeName={own?.name ?? null}
          items={history.items}
          loading={history.loading}
          error={history.error}
          openedId={opened?.id ?? null}
          onOpen={(item) => void onOpenHistory(item)}
          onDelete={(item) => void onDeleteHistory(item)}
          onReload={() => void loadHistory(ownId)}
          busyId={busyId}
        />
      )}

      <Card
        number={history.enabled ? 4 : 3}
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
