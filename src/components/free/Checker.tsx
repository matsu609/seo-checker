"use client";

/**
 * 無料 SEO・AIO 診断（サイト）の画面。店舗の MEO 診断は free/MeoChecker.tsx（/meo）。
 *
 * - フォーム・進捗・操作行は no-print、レポート本体（reportRef）だけを PDF 化する
 * - page は POST /api/analyze、site は POST /api/site の NDJSON ストリーム（readNdjson 経由）
 * - 診断範囲・進捗・中止はここで持ち、描画は free/ の各セクションに任せる
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";
import type { AnalysisResult, SiteAnalysisResult, SiteProgress } from "@/lib/analyzer/types";
import { requestSiteAnalysis, SiteRequestError } from "@/lib/crawl/client";
import { downloadPdf } from "@/lib/pdf/download";
import { reportFileName } from "@/lib/report";
import { DiagnosisForm, type Mode } from "./DiagnosisForm";
import { Download, Printer } from "./Icons";
import { PageReport } from "./PageReport";
import { ProgressPanel } from "./ProgressPanel";
import { SiteReport } from "./SiteReport";

type State =
  | { phase: "idle" }
  | { phase: "loading"; mode: Mode; progress: SiteProgress | null }
  | { phase: "error"; message: string }
  | { phase: "done"; mode: "page"; result: AnalysisResult; cached: boolean; elapsedMs: number }
  | { phase: "done"; mode: "site"; result: SiteAnalysisResult; cached: boolean; elapsedMs: number };

/** 印刷ダイアログから「PDF に保存」したときの既定ファイル名を合わせる */
function printAsPdf(title: string) {
  const original = document.title;
  const restore = () => {
    document.title = original;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  document.title = title;
  window.print();
  // afterprint が発火しないブラウザ向けの保険
  setTimeout(restore, 10_000);
}

function messageOf(err: unknown): string {
  if (err instanceof SiteRequestError) return err.message;
  if (err instanceof TypeError) {
    return "サーバーに接続できませんでした。通信の状態を確認して、もう一度お試しください。";
  }
  if (err instanceof Error && err.message) return err.message;
  return "診断に失敗しました。しばらく待ってからもう一度お試しください。";
}

export function Checker() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("page");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [faqEnabled, setFaqEnabled] = useState(false);
  const [pdf, setPdf] = useState<"idle" | "working" | "failed">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/faq")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setFaqEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (alive) setFaqEnabled(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 診断中だけ経過時間を進める（no-print 領域なので PDF には影響しない）
  const loading = state.phase === "loading";
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // 画面を離れるときは走っているクロールを止める
  useEffect(() => () => abortRef.current?.abort(), []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ phase: "idle" });
    setNotice("診断を中止しました。");
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const target = url.trim();
    if (!target) {
      setFormError("URL を入力してください。");
      return;
    }
    setFormError(null);
    setNotice(null);
    setPdf("idle");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const current = mode;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState({ phase: "loading", mode: current, progress: null });

    try {
      if (current === "site") {
        const { result, cached } = await requestSiteAnalysis(target, {
          signal: controller.signal,
          onProgress: (progress) =>
            setState((prev) => (prev.phase === "loading" ? { ...prev, progress } : prev)),
        });
        if (controller.signal.aborted) return;
        setState({
          phase: "done",
          mode: "site",
          result,
          cached,
          elapsedMs: Date.now() - startedAtRef.current,
        });
      } else {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: target }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "診断に失敗しました");
        if (controller.signal.aborted) return;
        setState({
          phase: "done",
          mode: "page",
          result: data.result as AnalysisResult,
          cached: Boolean(data.cached),
          elapsedMs: Date.now() - startedAtRef.current,
        });
      }
    } catch (err) {
      // 中止ボタン・画面離脱による中断はエラーとして扱わない
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setState({ phase: "error", message: messageOf(err) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function onDownloadPdf(fileName: string) {
    const element = reportRef.current;
    if (!element) return;
    setPdf("working");
    try {
      await downloadPdf({ element, fileName });
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }

  const fileName =
    state.phase !== "done"
      ? ""
      : state.mode === "site"
        ? reportFileName("site", state.result.entryUrl, state.result.fetchedAt)
        : reportFileName("page", state.result.page.finalUrl, state.result.page.fetchedAt);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <DiagnosisForm
        url={url}
        onUrlChange={setUrl}
        mode={mode}
        onModeChange={setMode}
        onSubmit={onSubmit}
        busy={state.phase === "loading"}
        error={formError}
      />

      {state.phase === "loading" && (
        <ProgressPanel
          mode={state.mode}
          progress={state.progress}
          elapsedMs={elapsedMs}
          onAbort={abort}
        />
      )}

      {notice && state.phase !== "loading" && (
        <p className="no-print mb-6 text-[13px] text-muted" role="status">
          {notice}
        </p>
      )}

      {state.phase === "error" && (
        <Callout tone="fail" className="no-print mb-6" title="診断できませんでした">
          {state.message}
        </Callout>
      )}

      {state.phase === "done" && (
        <>
          <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {state.cached && (
              <span className="mr-auto text-[12px] text-muted">直近の診断結果を表示しています</span>
            )}
            <Button
              size="sm"
              onClick={() => onDownloadPdf(fileName)}
              loading={pdf === "working"}
              icon={<Download className="h-4 w-4" />}
            >
              {pdf === "working" ? "PDF を作成中…" : "PDFでダウンロード"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => printAsPdf(fileName)}
              icon={<Printer className="h-4 w-4" />}
            >
              印刷
            </Button>
            {pdf === "failed" && (
              <p className="w-full text-right text-[12px] text-fail" role="alert">
                PDF を作成できませんでした。「印刷」から、送信先を「PDF に保存」にしてお試しください。
              </p>
            )}
          </div>

          <div ref={reportRef} className="@container">
            {state.mode === "page" ? (
              <PageReport result={state.result} faqEnabled={faqEnabled} elapsedMs={state.elapsedMs} />
            ) : (
              <SiteReport result={state.result} elapsedMs={state.elapsedMs} />
            )}
          </div>
        </>
      )}
    </main>
  );
}
