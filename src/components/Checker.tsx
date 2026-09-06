"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AnalysisResult } from "@/lib/analyzer/types";
import { CheckList } from "./CheckList";
import { FaqSection } from "./FaqSection";
import { Printer, Search, Sparkle } from "./Icons";
import { ScoreCard } from "./ScoreCard";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; result: AnalysisResult; cached: boolean };

export function Checker() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const [faqEnabled, setFaqEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/faq")
      .then((r) => r.json())
      .then((d) => setFaqEnabled(Boolean(d.enabled)))
      .catch(() => setFaqEnabled(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "診断に失敗しました");
      setState({ phase: "done", result: data.result, cached: Boolean(data.cached) });
    } catch (err) {
      setState({ phase: "error", message: (err as Error).message });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-sm">
          <Sparkle className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">AIO診断・FAQ生成</h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
            URLを入れると、AI検索（AIO）対策の状況を診断し、想定FAQを提案します
          </p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        className="no-print mt-6 rounded-2xl bg-panel p-4 shadow-sm ring-1 ring-line sm:p-5"
      >
        <label htmlFor="url" className="sr-only">
          診断するURL
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/"
            className="w-full rounded-xl border border-line py-3.5 pr-4 pl-12 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <button
          type="submit"
          disabled={state.phase === "loading"}
          className="mt-3 w-full rounded-xl bg-accent py-3.5 text-lg font-bold text-white shadow-sm hover:bg-accent-strong disabled:cursor-wait disabled:opacity-60"
        >
          {state.phase === "loading" ? "診断中…" : "診断する"}
        </button>
        <p className="mt-2 text-xs text-muted">
          診断はルールベースで行うため無料です。FAQ生成のみAIを使用します。
        </p>
      </form>

      {state.phase === "loading" && (
        <div className="mt-6 rounded-2xl bg-panel p-6 text-center text-sm text-muted shadow-sm ring-1 ring-line">
          ページ・robots.txt・llms.txt を取得して解析しています…
        </div>
      )}

      {state.phase === "error" && (
        <div className="mt-6 rounded-2xl border border-fail/30 bg-fail/5 p-5 text-sm text-fail">
          {state.message}
        </div>
      )}

      {state.phase === "done" && (
        <div className="mt-6 space-y-6">
          <div className="no-print flex items-center justify-end gap-3">
            {state.cached && (
              <span className="text-xs text-muted">直近の診断結果を表示しています</span>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-surface"
            >
              <Printer className="h-4 w-4" />
              PDFで保存
            </button>
          </div>
          <ScoreCard result={state.result} />
          <CheckList result={state.result} />
          <FaqSection
            key={state.result.page.finalUrl}
            result={state.result}
            enabled={faqEnabled}
          />
        </div>
      )}
    </main>
  );
}
