"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AnalysisResult, SiteAnalysisResult } from "@/lib/analyzer/types";
import { CheckList } from "./CheckList";
import { FaqSection } from "./FaqSection";
import { Printer, Search, Sparkle } from "./Icons";
import { ScoreCard } from "./ScoreCard";
import { SiteReport } from "./SiteReport";

/** ページ単位（1 URL）か、サイト単位（複数ページの集計）か */
type Mode = "page" | "site";

type State =
  | { phase: "idle" }
  | { phase: "loading"; mode: Mode }
  | { phase: "error"; message: string }
  | { phase: "done"; mode: "page"; result: AnalysisResult; cached: boolean }
  | { phase: "done"; mode: "site"; result: SiteAnalysisResult; cached: boolean };

export function Checker() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("page");
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
    const current = mode;
    setState({ phase: "loading", mode: current });
    try {
      const res = await fetch(current === "site" ? "/api/site" : "/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "診断に失敗しました");
      const cached = Boolean(data.cached);
      setState(
        current === "site"
          ? { phase: "done", mode: "site", result: data.result, cached }
          : { phase: "done", mode: "page", result: data.result, cached },
      );
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
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="診断の範囲">
          {(
            [
              { value: "page", label: "このページ", hint: "入力したURL 1 ページ" },
              { value: "site", label: "サイト全体", hint: "主要ページをまとめて" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mode === opt.value}
              onClick={() => setMode(opt.value)}
              className={`rounded-xl border px-3 py-2.5 text-left ${
                mode === opt.value
                  ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                  : "border-line bg-surface hover:bg-panel"
              }`}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="block text-xs text-muted">{opt.hint}</span>
            </button>
          ))}
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
          {mode === "page"
            ? "「このページ」は入力したURL 1 ページだけを評価します。同じサイトでもページが違えば内容が違うため、点数は変わります。"
            : "「サイト全体」は sitemap または内部リンクから主要ページを最大 5 ページ選んで診断し、平均とページごとの差を出します。"}
        </p>
      </form>

      {state.phase === "loading" && (
        <div className="mt-6 rounded-2xl bg-panel p-6 text-center text-sm text-muted shadow-sm ring-1 ring-line">
          {state.mode === "site"
            ? "サイト内の主要ページを順に取得して解析しています。1 分ほどかかることがあります…"
            : "ページ・robots.txt・llms.txt を取得して解析しています…"}
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
          {state.mode === "page" ? (
            <>
              <ScoreCard result={state.result} />
              <CheckList result={state.result} />
              <FaqSection
                key={state.result.page.finalUrl}
                result={state.result}
                enabled={faqEnabled}
              />
            </>
          ) : (
            <SiteReport result={state.result} />
          )}
        </div>
      )}
    </main>
  );
}
