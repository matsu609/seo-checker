"use client";

/**
 * 無料 MEO 診断（/meo、ログイン不要）。
 *
 * 店名・地域で検索 → 店舗を 1 件選ぶ → 公開情報を採点した報告書（PDF 可）。
 * 有料の /tools/maps と違い、保存・競合比較・毎週の更新・AI 総評は無い。
 * 報告書の末尾で有料プランへ案内する。API は /api/meo/*（回数制限つき）。
 */
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { FreeMeoReportResponse } from "@/app/api/meo/report/route";
import type { FreeMeoSearchResponse } from "@/app/api/meo/search/route";
import { MeoReportView } from "@/components/maps/report/MeoReportView";
import { formatCount, formatRating, statusLabel } from "@/components/maps/format";
import { Button, Callout, DataTable, Field, Input, type Column } from "@/components/ui";
import { FREE_SUITE_LABEL } from "@/lib/features/registry";
import { meoReportFileName } from "@/lib/maps/report";
import type { PlaceSummary } from "@/lib/maps/types";
import { downloadPdf } from "@/lib/pdf/download";
import { Download } from "./Icons";
import { FreeTargetSwitch } from "./FreeTargetSwitch";
import { ServiceGuideButton } from "./ServiceGuideButton";

type Search = { phase: "idle" } | { phase: "loading" } | { phase: "error"; message: string } | { phase: "done"; data: FreeMeoSearchResponse };
type Report =
  | { phase: "idle" }
  | { phase: "loading"; placeId: string }
  | { phase: "error"; message: string }
  | { phase: "done"; data: FreeMeoReportResponse; placeId: string };

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

export interface MeoCheckerProps {
  /** Places API が設定されているか（サーバーで判定して渡す） */
  enabled: boolean;
}

export function MeoChecker({ enabled }: MeoCheckerProps) {
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState<Search>({ phase: "idle" });
  const [report, setReport] = useState<Report>({ phase: "idle" });
  const [pdf, setPdf] = useState<"idle" | "working" | "failed">("idle");
  const reportRef = useRef<HTMLDivElement>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setFormError("店名や地域を入力してください。");
      return;
    }
    setFormError(null);
    setSearch({ phase: "loading" });
    setReport({ phase: "idle" });
    try {
      const res = await fetch("/api/meo/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setSearch({ phase: "done", data: (await res.json()) as FreeMeoSearchResponse });
    } catch (err) {
      setSearch({ phase: "error", message: err instanceof Error ? err.message : "検索に失敗しました" });
    }
  }

  async function onDiagnose(place: PlaceSummary) {
    setPdf("idle");
    setReport({ phase: "loading", placeId: place.id });
    try {
      const res = await fetch("/api/meo/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: place.id }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setReport({ phase: "done", data: (await res.json()) as FreeMeoReportResponse, placeId: place.id });
      // 報告書までスクロール（フォームは上に残す）
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setReport({ phase: "error", message: err instanceof Error ? err.message : "診断に失敗しました" });
    }
  }

  async function onDownloadPdf() {
    const element = reportRef.current;
    if (!element || report.phase !== "done") return;
    setPdf("working");
    try {
      await downloadPdf({ element, fileName: meoReportFileName(report.data.report) });
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }

  const columns: Column<PlaceSummary>[] = [
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
    { key: "category", header: "カテゴリ", render: (p) => p.category ?? "—", nowrap: true },
    {
      key: "rating",
      header: "評価",
      align: "right",
      render: (p) => (
        <span className="tabular-nums">
          {formatRating(p.rating)}
          <span className="ml-1 text-[12px] text-muted">({formatCount(p.ratingCount)})</span>
        </span>
      ),
    },
    { key: "status", header: "状態", render: (p) => statusLabel(p.status), nowrap: true },
    {
      key: "action",
      header: "",
      nowrap: true,
      render: (p) => (
        <Button
          size="sm"
          onClick={() => void onDiagnose(p)}
          loading={report.phase === "loading" && report.placeId === p.id}
          disabled={report.phase === "loading"}
          variant={report.phase === "done" && report.placeId === p.id ? "secondary" : "primary"}
        >
          {report.phase === "done" && report.placeId === p.id ? "表示中" : "この店舗を診断"}
        </Button>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <section className="no-print mb-6 rounded-sm border border-line bg-panel p-5">
        <h1 className="text-[20px] font-bold text-ink">{FREE_SUITE_LABEL}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          店名を入力すると、Google マップ上の店舗情報（ビジネス プロフィール）を基本情報・投稿・写真・レビューの 4 カテゴリで採点し、報告書として出力します。ログイン不要です。
        </p>
        <FreeTargetSwitch current="meo" />

        {!enabled ? (
          <Callout tone="info" className="mt-4" title="店舗診断は準備中です">
            現在この診断はご利用いただけません。サイトの診断はそのまま使えます。
          </Callout>
        ) : (
          <form onSubmit={onSearch} className="mt-4" noValidate>
            <Field label="店名・地域" htmlFor="meo-query" error={formError}>
              <Input
                id="meo-query"
                type="text"
                placeholder="渋谷 美容室 ○○"
                value={query}
                maxLength={200}
                invalid={Boolean(formError)}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" loading={search.phase === "loading"} className="mt-3 w-full">
              店舗を探す
            </Button>
          </form>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Google マップの公開情報だけを使い、採点はルールベース（生成 AI 不使用）です。オーナー権限が要る項目は「未取得」として採点から外します。
        </p>

        {search.phase === "error" && (
          <Callout tone="fail" className="mt-4" title="検索できませんでした">
            {search.message}
          </Callout>
        )}
        {search.phase === "done" && (
          <div className="mt-4">
            <DataTable
              rows={search.data.places}
              columns={columns}
              rowKey={(p) => p.id}
              dense
              minWidth="40rem"
              emptyText="該当する店舗が見つかりませんでした。地域名や表記を変えて検索してください。"
            />
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[12px] leading-relaxed text-muted">
            競合との比較、毎週の自動更新と推移、AI による総評、Google の属性・写真の品質・口コミのキーワード・警告を含む 28 項目の採点と、オーナー情報の入力（説明文・投稿・返信など 9 項目）は有料プランで使えます。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ServiceGuideButton />
            <Link href="/plans" className="text-[12px] text-accent underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-accent/40">
              料金プランを見る
            </Link>
          </div>
        </div>
      </section>

      {report.phase === "error" && (
        <Callout tone="fail" className="no-print mb-6" title="診断できませんでした">
          {report.message}
        </Callout>
      )}

      {report.phase === "done" && (
        <>
          <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {report.data.cached && <span className="mr-auto text-[12px] text-muted">直近 6 時間以内の情報を表示しています</span>}
            {pdf === "failed" && <span className="text-[13px] text-fail">PDF を作成できませんでした</span>}
            <Button size="sm" onClick={() => void onDownloadPdf()} loading={pdf === "working"} icon={<Download className="h-4 w-4" />}>
              {pdf === "working" ? "PDF を作成中…" : "PDFでダウンロード"}
            </Button>
          </div>
          <div ref={reportRef}>
            <MeoReportView report={report.data.report} aiCommentary={null} />
          </div>
          <Callout tone="info" className="no-print mt-6" title="続きは有料プランで">
            登録すると、この店舗を毎週月曜に自動で取り直して推移を記録し、競合 5 店舗との比較表と AI による総評が使えます。採点は 21 項目から 28 項目（属性・オーナー写真・写真の解像度・口コミのキーワード・口コミ本文・Google の警告）に増え、オーナー情報の入力で残りの項目も採点できます。
            <span className="mt-2 block">
              <Link href="/sign-up" className="font-bold text-accent underline underline-offset-2">
                無料で登録する
              </Link>
              <span className="mx-2 text-muted">・</span>
              <Link href="/plans" className="text-accent underline underline-offset-2">
                料金プランを見る
              </Link>
            </span>
          </Callout>
        </>
      )}
    </main>
  );
}
