"use client";

/**
 * Google マップ・店舗情報（MEO）。
 *
 * 1. 店名や地域で候補を探し、自社の店舗と、その競合（最大 5 件）を登録する
 * 2. 自社の最新の診断レポート（4 カテゴリの採点・総評・口コミ情報）を見て、PDF に出す
 * 3. 保存された履歴（前回との差分）
 * 4. 競合と並べて比較する
 *
 * 数字は利用者が取り直せない。登録直後に 1 回、その後は毎週月曜 5:00 の一斉更新だけ
 * （src/lib/maps/refresh.ts）。登録店舗はサーバー（Supabase）、画面の状態だけ localStorage。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapsCommentaryResponse } from "@/app/api/maps/commentary/route";
import type { MapsCompareItem, MapsCompareResponse } from "@/app/api/maps/compare/route";
import type { MapsHistoryEntryResponse } from "@/app/api/maps/history/[id]/route";
import type { MapsHistoryListResponse } from "@/app/api/maps/history/route";
import type { MapsSearchResponse } from "@/app/api/maps/search/route";
import type { MapsStoreAddResponse, MapsStoresResponse } from "@/app/api/maps/stores/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { toCommentaryInput } from "@/lib/maps/commentary-input";
import type { MeoHistoryItem, SavedMeoReport } from "@/lib/maps/history";
import { meoReportFileName } from "@/lib/maps/report";
import { MAX_COMPETITORS_PER_STORE, type MeoStore } from "@/lib/maps/stores";
import type { PlaceSummary } from "@/lib/maps/types";
import { downloadPdf } from "@/lib/pdf/download";
import { formatDateTime } from "@/lib/report/format";
import { useStore } from "@/lib/store/hooks";
import { mapsViewStore } from "@/lib/store/maps";
import { useToolRun } from "@/lib/tools/run";
import { formatCount, formatRating, hostOf, statusLabel } from "./format";
import { MeoHistoryCard } from "./MeoHistoryCard";
import { MeoReportView } from "./report/MeoReportView";

type PdfState = "idle" | "working" | "failed";

interface StoresState {
  stores: MeoStore[];
  nextRefreshAt: string | null;
  loading: boolean;
  error: string | null;
}

interface HistoryState {
  items: MeoHistoryItem[];
  loading: boolean;
  error: string | null;
}

/** 報告書欄に出しているもの */
interface Shown {
  id: string;
  report: SavedMeoReport;
  /** 最新ではなく履歴から開いたもの */
  fromHistory: boolean;
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

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

export function MapsTool() {
  const [view, setView] = useStore(mapsViewStore);
  const [query, setQuery] = useState(view.query);
  const search = useToolRun<MapsSearchResponse>();
  const commentary = useToolRun<MapsCommentaryResponse>();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [pdf, setPdf] = useState<PdfState>("idle");
  const [stores, setStores] = useState<StoresState>({ stores: [], nextRefreshAt: null, loading: true, error: null });
  const [history, setHistory] = useState<HistoryState>({ items: [], loading: false, error: null });
  const [shown, setShown] = useState<Shown | null>(null);
  const [compare, setCompare] = useState<{ data: MapsCompareResponse | null; loading: boolean; error: string | null }>({
    data: null,
    loading: false,
    error: null,
  });
  const [registering, setRegistering] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "fail"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const owns = useMemo(() => stores.stores.filter((s) => s.role === "own"), [stores.stores]);
  const own = useMemo(
    () => owns.find((s) => s.placeId === view.currentOwnId) ?? owns[0] ?? null,
    [owns, view.currentOwnId],
  );
  const ownId = own?.placeId ?? null;
  const competitors = useMemo(
    () => stores.stores.filter((s) => s.role === "competitor" && s.ownPlaceId === ownId),
    [stores.stores, ownId],
  );
  const registeredIds = useMemo(() => new Set(stores.stores.map((s) => s.placeId)), [stores.stores]);

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

  const loadStores = useCallback(async (signal?: AbortSignal) => {
    setStores((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const body = await getJson<MapsStoresResponse>("/api/maps/stores", signal);
      setStores({ stores: body.stores, nextRefreshAt: body.nextRefreshAt, loading: false, error: null });
    } catch (err) {
      if (signal?.aborted) return;
      setStores((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "登録店舗を読み込めませんでした" }));
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadStores(ac.signal);
    return () => ac.abort();
  }, [loadStores]);

  // 自社店舗が変わったら、履歴（最新を含む）と比較を取り直す
  const loadHistory = useCallback(async (placeId: string, signal?: AbortSignal) => {
    setHistory((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const body = await getJson<MapsHistoryListResponse>(`/api/maps/history?placeId=${encodeURIComponent(placeId)}`, signal);
      setHistory({ items: body.items, loading: false, error: null });
      const latest = body.items[0];
      if (latest) {
        const entry = await getJson<MapsHistoryEntryResponse>(`/api/maps/history/${encodeURIComponent(latest.id)}`, signal);
        setShown({ id: entry.item.id, report: entry.report, fromHistory: false });
      } else {
        setShown(null);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setHistory((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "履歴を読み込めませんでした" }));
    }
  }, []);

  const loadCompare = useCallback(async (placeId: string, signal?: AbortSignal) => {
    setCompare({ data: null, loading: true, error: null });
    try {
      const body = await getJson<MapsCompareResponse>(`/api/maps/compare?ownPlaceId=${encodeURIComponent(placeId)}`, signal);
      setCompare({ data: body, loading: false, error: null });
    } catch (err) {
      if (signal?.aborted) return;
      setCompare({ data: null, loading: false, error: err instanceof Error ? err.message : "比較を読み込めませんでした" });
    }
  }, []);

  useEffect(() => {
    commentary.reset();
    setPdf("idle");
    if (!ownId) {
      setShown(null);
      setHistory({ items: [], loading: false, error: null });
      setCompare({ data: null, loading: false, error: null });
      return;
    }
    const ac = new AbortController();
    void loadHistory(ownId, ac.signal);
    void loadCompare(ownId, ac.signal);
    return () => ac.abort();
    // commentary.reset は安定した関数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownId, loadHistory, loadCompare]);

  async function onSearch() {
    const q = query.trim();
    if (!q) return;
    setView((prev) => ({ ...prev, query: q }));
    await search.run("/api/maps/search", { query: q });
  }

  async function onRegister(place: PlaceSummary, role: "own" | "competitor") {
    if (role === "competitor" && !ownId) return;
    setRegistering(place.id);
    setNotice(null);
    try {
      const res = await fetch("/api/maps/stores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: place.id, name: place.name, ownPlaceId: role === "competitor" ? ownId : undefined }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsStoreAddResponse;
      await loadStores();
      if (role === "own") setView((prev) => ({ ...prev, currentOwnId: place.id }));
      else if (ownId) {
        void loadCompare(ownId);
      }
      if (!body.fetched) {
        setNotice({ tone: "warn", text: `${place.name} を登録しましたが、店舗情報をいま取得できませんでした（${body.fetchError ?? "不明"}）。次回の一斉更新で取得します。` });
      } else if (role === "own") {
        // 登録直後の報告書を出す
        void loadHistory(place.id);
        setNotice({ tone: "info", text: `${place.name} を自社として登録し、診断レポートを作成しました。` });
      } else {
        setNotice({ tone: "info", text: `${place.name} を競合として登録しました。` });
      }
    } catch (err) {
      setNotice({ tone: "fail", text: err instanceof Error ? err.message : "登録できませんでした" });
    } finally {
      setRegistering(null);
    }
  }

  async function onRemove(store: MeoStore) {
    const what = store.role === "own" ? `${store.name} と、その競合の登録を外します。履歴は残ります。` : `${store.name} を競合から外します。`;
    if (!window.confirm(`${what}よろしいですか？`)) return;
    setBusyId(store.id);
    try {
      const res = await fetch(`/api/maps/stores/${encodeURIComponent(store.id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res));
      await loadStores();
      if (store.role === "competitor" && ownId) void loadCompare(ownId);
    } catch (err) {
      setNotice({ tone: "fail", text: err instanceof Error ? err.message : "外せませんでした" });
    } finally {
      setBusyId(null);
    }
  }

  async function onCommentary() {
    if (!shown) return;
    const { detail, score } = shown.report;
    const result = await commentary.run("/api/maps/commentary", { input: toCommentaryInput(detail, score) });
    if (!result) return;
    // 生成した総評を保存済みの報告書に書き足す（次に開いたときも同じ総評）
    try {
      await fetch(`/api/maps/history/${encodeURIComponent(shown.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiCommentary: result.paragraphs }),
      });
      setShown((prev) => (prev && prev.id === shown.id ? { ...prev, report: { ...prev.report, aiCommentary: result.paragraphs } } : prev));
    } catch {
      // 保存に失敗しても画面には出ている
    }
  }

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

  async function onOpenHistory(item: MeoHistoryItem) {
    setBusyId(item.id);
    try {
      const entry = await getJson<MapsHistoryEntryResponse>(`/api/maps/history/${encodeURIComponent(item.id)}`);
      const latestId = history.items[0]?.id ?? null;
      setShown({ id: entry.item.id, report: entry.report, fromHistory: entry.item.id !== latestId });
      commentary.reset();
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
      if (ownId) await loadHistory(ownId);
    } catch (err) {
      setHistory((prev) => ({ ...prev, error: err instanceof Error ? err.message : "削除できませんでした" }));
    } finally {
      setBusyId(null);
    }
  }

  const aiCommentary = shown
    ? (shown.report.aiCommentary ?? (commentary.state.phase === "done" ? commentary.state.data.paragraphs : null))
    : null;

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
      header: "登録",
      nowrap: true,
      render: (p) => {
        const registered = registeredIds.has(p.id);
        const full = competitors.length >= MAX_COMPETITORS_PER_STORE;
        return (
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void onRegister(p, "own")} disabled={registered} loading={registering === p.id}>
              {registered ? "登録済み" : "自社として登録"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void onRegister(p, "competitor")}
              disabled={registered || !ownId || full || registering !== null}
              title={!ownId ? "先に自社の店舗を登録してください" : full ? `競合は ${MAX_COMPETITORS_PER_STORE} 件までです` : undefined}
            >
              競合として登録
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
            {r.role === "own" && <Badge tone="info" icon={false}>自社</Badge>}
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
    { key: "generatedAt", header: "取得日時", nowrap: true, render: (r) => <span className="text-[12px] text-muted">{formatDateTime(r.generatedAt)}</span> },
  ];

  const nextRefreshLabel = stores.nextRefreshAt ? formatDateTime(stores.nextRefreshAt) : null;

  return (
    <div className="space-y-6">
      <Card
        number={1}
        title="店舗の登録"
        description="店名と地域（例: 渋谷 美容室 ○○）で検索し、自社の店舗と、その競合を最大 5 件まで登録します。登録した店舗の数字は毎週月曜 5:00 に一斉更新します（手動の取り直しはできません）。"
        className="no-print"
      >
        {owns.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-line bg-surface p-3">
            <Field label="見る自社店舗" className="min-w-64">
              <Select value={own?.placeId ?? ""} onChange={(e) => setView((prev) => ({ ...prev, currentOwnId: e.target.value || null }))}>
                {owns.map((s) => (
                  <option key={s.id} value={s.placeId}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            {own && (
              <Button size="sm" variant="ghost" onClick={() => void onRemove(own)} loading={busyId === own.id}>
                この店舗の登録を外す
              </Button>
            )}
            {nextRefreshLabel && <span className="ml-auto text-[12px] text-muted">次回の一斉更新: {nextRefreshLabel}</span>}
          </div>
        )}

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

        {stores.error && (
          <Callout tone="fail" title="登録店舗を読み込めませんでした" className="mt-4">
            {stores.error}
          </Callout>
        )}
        {notice && (
          <Callout tone={notice.tone} className="mt-4">
            {notice.text}
          </Callout>
        )}
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
          {own ? <Badge tone="info" icon={false}>{own.name}</Badge> : <span className="text-muted">未登録</span>}
          <span className="ml-3 text-muted">
            競合 ({competitors.length}/{MAX_COMPETITORS_PER_STORE}):
          </span>
          {competitors.length === 0 && <span className="text-muted">なし</span>}
          {competitors.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void onRemove(c)}
              disabled={busyId !== null}
              title="競合から外す"
              className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-ink hover:bg-panel disabled:opacity-60"
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
        padding="sm"
      >
        {!own && !stores.loading && (
          <EmptyState title="自社の店舗を登録してください" description="上の検索結果で「自社として登録」を押すと、診断レポートを作成します。" />
        )}

        {own && history.error && !shown && (
          <Callout tone="fail" title="レポートを読み込めませんでした">
            {history.error}
          </Callout>
        )}

        {own && !history.loading && !history.error && !shown && (
          <EmptyState
            title="まだ診断レポートがありません"
            description={`登録時に取得できなかった店舗です。次回の一斉更新（${nextRefreshLabel ?? "毎週月曜 5:00"}）で作成します。`}
          />
        )}

        {shown && (
          <>
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="text-[12px] text-muted">
                {shown.fromHistory ? "履歴の報告書を表示中: " : "最新の報告書: "}
                {formatDateTime(shown.report.generatedAt)} 時点
                {nextRefreshLabel && !shown.fromHistory && <>（次回の更新 {nextRefreshLabel}）</>}
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {commentary.state.phase === "error" && <span className="text-[13px] text-fail">{commentary.state.message}</span>}
                {pdf === "failed" && <span className="text-[13px] text-fail">PDF を作成できませんでした</span>}
                {aiEnabled && !aiCommentary && (
                  <Button variant="secondary" size="sm" onClick={() => void onCommentary()} loading={commentary.state.phase === "running"}>
                    AI 総評を生成
                  </Button>
                )}
                <Button size="sm" onClick={() => void onDownloadPdf()} loading={pdf === "working"}>
                  PDF でダウンロード
                </Button>
              </div>
            </div>
            <div ref={reportRef}>
              <MeoReportView report={shown.report} aiCommentary={aiCommentary} />
            </div>
          </>
        )}
      </Card>

      <MeoHistoryCard
        number={3}
        placeName={own?.name ?? null}
        items={history.items}
        loading={history.loading}
        error={history.error}
        openedId={shown?.id ?? null}
        onOpen={(item) => void onOpenHistory(item)}
        onDelete={(item) => void onDeleteHistory(item)}
        onReload={() => {
          if (ownId) void loadHistory(ownId);
        }}
        busyId={busyId}
      />

      <Card
        number={4}
        title="競合との比較"
        description="自社と登録した競合を、最新の一斉更新の数字で並べます。口コミは Google が返す最大 5 件です。"
        className="no-print"
      >
        {!own && !stores.loading && (
          <EmptyState title="自社の店舗を登録してください" description="競合を登録すると、ここに比較表が出ます。" />
        )}

        {own && compare.error && (
          <Callout tone="fail" title="比較を読み込めませんでした">
            {compare.error}
          </Callout>
        )}

        {own && compare.data && (
          <div className="space-y-4">
            <DataTable
              rows={compare.data.results}
              columns={compareColumns}
              rowKey={(r) => r.placeId}
              defaultSort={{ key: "score", dir: "desc" }}
              rowClassName={(r) => (r.role === "own" ? "bg-accent-soft" : undefined)}
              minWidth="60rem"
              emptyText="表示できる店舗がありません。競合を登録すると、ここに並びます。"
            />
            {compare.data.missing.length > 0 && (
              <Callout tone="warn" title="まだ数字が無い店舗があります">
                {compare.data.missing.map((m) => m.name).join("、")} は登録時に取得できませんでした。次回の一斉更新で取得します。
              </Callout>
            )}
            <p className="text-[11px] text-muted">データ: Google Places API。毎週月曜 5:00 に一斉更新。</p>
          </div>
        )}
      </Card>
    </div>
  );
}
