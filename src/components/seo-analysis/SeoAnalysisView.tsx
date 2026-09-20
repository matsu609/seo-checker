"use client";

/**
 * 精密診断の画面。
 *
 * 流れ: 入力 → 収集（NDJSON で進捗）→ 専門家のアドバイス（別リクエスト）→ 報告書。
 * 収集とアドバイスを分けているのは、サーバーの実行時間の上限に収めるためと、
 * 同じ事実シートでアドバイスだけを作り直せるようにするため。
 * 画面では「AI 分析」と呼ばず「専門家のアドバイス」で統一する（利用者の指示 2026-09-19）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, ProgressBar, Select } from "@/components/ui";
import type { AuditResult } from "@/lib/audit/types";
import type { AnalysisRecord } from "@/lib/seo-analysis/ai/schema";
import { CRAWL_PAGE_LIMIT, MAX_COMPETITORS, MAX_KEYWORDS } from "@/lib/seo-analysis/input";
import { MAX_ANALYSES_PER_RUN } from "@/lib/seo-analysis/limits";
import type { RunSummary } from "@/lib/seo-analysis/runs";
import { GOAL_LABELS, type AnalysisGoal, type AnalysisInput, type SeoFactSheet } from "@/lib/seo-analysis/sheet/types";
import { diagnosisProgress, stageOfStep, stageStates, type DiagnosisStageId } from "@/lib/seo-analysis/progress";
import { filledSlots, seoAnalysisFormStore, toSlots, withSlot } from "@/lib/seo-analysis/store";
import { SiteTargetNotice, useRegisteredSite } from "@/components/site/RegisteredSite";
import { useSharedSettings } from "@/lib/settings/client";
import { formatDateTime, hostOf } from "@/lib/report";
import { useStore } from "@/lib/store/hooks";
import type { SeoAnalysisDiffResponse } from "@/app/api/seo-analysis/[id]/diff/route";
import type { SheetDiff } from "@/lib/seo-analysis/diff";
import { DiffCard } from "./DiffCard";
import { ReportView } from "./ReportView";
import {
  deleteRunRequest,
  fetchRun,
  fetchRuns,
  requestAnalyze,
  requestCollect,
  SeoAnalysisError,
  type AnalyzeProgressEvent,
  type CollectProgressEvent,
  type RunsResponse,
} from "./client";

type Phase = "idle" | "collecting" | "analyzing" | "done" | "error";

interface Loaded {
  runId: string;
  sheet: SeoFactSheet;
  audit: AuditResult | null;
  analysis: AnalysisRecord | null;
  analysisCount: number;
}

export function SeoAnalysisView() {
  const [form, setForm] = useStore(seoAnalysisFormStore);
  // 分析するサイトは設定に登録したホームページ。この画面では URL を聞かない（競合だけ残す）
  const site = useRegisteredSite();
  // キーワード・競合・ブランド名・業種・地域は設定から初期値を入れる（空欄のときだけ。直した値はそのまま残る）
  const shared = useSharedSettings();
  useEffect(() => {
    const defaults = {
      brand: shared.project?.name.trim() || shared.lead?.company || "",
      industry: shared.lead?.storeType ?? "",
      region: shared.lead?.region ?? "",
    };
    const keywordDefaults = toSlots(shared.keywords, MAX_KEYWORDS);
    const competitorDefaults = toSlots((shared.project?.competitors ?? []).flatMap((c) => c.domains), MAX_COMPETITORS);
    seoAnalysisFormStore.update((prev) => {
      let next = prev;
      for (const key of ["brand", "industry", "region"] as const) {
        if (!prev[key].trim() && defaults[key]) next = { ...next, [key]: defaults[key] };
      }
      // 枠が全部空のときだけ設定の値を入れる（1 つでも入れてあれば触らない）
      if (filledSlots(prev.keywords, MAX_KEYWORDS).length === 0 && filledSlots(keywordDefaults, MAX_KEYWORDS).length > 0) next = { ...next, keywords: keywordDefaults };
      if (filledSlots(prev.competitors, MAX_COMPETITORS).length === 0 && filledSlots(competitorDefaults, MAX_COMPETITORS).length > 0) next = { ...next, competitors: competitorDefaults };
      return next;
    });
  }, [shared.keywords, shared.project, shared.lead]);
  const [meta, setMeta] = useState<RunsResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectProgressEvent | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalyzeProgressEvent | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // 表示中の診断と、同じサイトの直前の診断との差分（直った / 悪化した）。診断ごとに持つ
  const [diff, setDiff] = useState<{ runId: string; diff: SheetDiff | null } | null>(null);
  const loadedRunId = loaded?.runId ?? null;

  useEffect(() => {
    if (!loadedRunId) return;
    const ac = new AbortController();
    fetch(`/api/seo-analysis/${encodeURIComponent(loadedRunId)}/diff`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as SeoAnalysisDiffResponse) : null))
      .then((body) => {
        if (!ac.signal.aborted && body) setDiff({ runId: loadedRunId, diff: body.diff });
      })
      .catch(() => {});
    return () => ac.abort();
  }, [loadedRunId]);
  const controller = useRef<AbortController | null>(null);

  const reloadMeta = useCallback(async () => {
    try {
      const next = await fetchRuns();
      setMeta(next);
      setMetaError(null);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "履歴を取得できませんでした");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchRuns()
      .then((next) => {
        if (!alive) return;
        setMeta(next);
        setMetaError(null);
      })
      .catch((err: unknown) => {
        if (alive) setMetaError(err instanceof Error ? err.message : "履歴を取得できませんでした");
      });
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, []);

  const runAnalysis = useCallback(
    async (runId: string) => {
      setPhase("analyzing");
      setAnalysisError(null);
      setAnalyzeProgress({ elapsedMs: 0, outputChars: 0, attempt: 1 });
      // 収集から続けて呼ばれたときは収集の controller を引き継ぐ。履歴から開いたときは新しく作る（「中止」で止められるように）
      const ac = controller.current ?? new AbortController();
      controller.current = ac;
      try {
        const { analysis, analysisCount } = await requestAnalyze(runId, { signal: ac.signal, onProgress: setAnalyzeProgress });
        if (ac.signal.aborted) return;
        setLoaded((prev) => (prev && prev.runId === runId ? { ...prev, analysis, analysisCount } : prev));
        setPhase("done");
        void reloadMeta();
      } catch (err) {
        if (ac.signal.aborted) return;
        setAnalysisError(err instanceof Error ? err.message : "専門家のアドバイスを作れませんでした");
        setPhase("done");
      } finally {
        setAnalyzeProgress(null);
        if (controller.current === ac) controller.current = null;
      }
    },
    [reloadMeta],
  );

  const start = useCallback(async () => {
    const url = site.siteUrl;
    if (!url) {
      setError("設定でホームページの URL を登録してください");
      setPhase("error");
      return;
    }
    const input: AnalysisInput = {
      url,
      keywords: filledSlots(form.keywords, MAX_KEYWORDS),
      industry: form.industry.trim(),
      goal: form.goal,
      region: form.region.trim(),
      competitors: filledSlots(form.competitors, MAX_COMPETITORS),
      brand: form.brand.trim(),
      maxPages: CRAWL_PAGE_LIMIT,
    };
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setPhase("collecting");
    setError(null);
    setProgress(null);
    setLoaded(null);
    setAnalysisError(null);
    try {
      const { run, sheet, audit } = await requestCollect(input, { signal: ac.signal, onProgress: setProgress });
      if (ac.signal.aborted) return;
      setLoaded({ runId: run.id, sheet, audit, analysis: null, analysisCount: 0 });
      await runAnalysis(run.id);
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof SeoAnalysisError || err instanceof Error ? err.message : "収集に失敗しました");
      setPhase("error");
      void reloadMeta();
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, [form, site.siteUrl, reloadMeta, runAnalysis]);

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setPhase((p) => (p === "analyzing" ? "done" : "idle"));
    setProgress(null);
    setAnalyzeProgress(null);
  }, []);

  const open = useCallback(
    async (id: string) => {
      setError(null);
      setAnalysisError(null);
      try {
        const run = await fetchRun(id);
        setLoaded({ runId: run.id, sheet: run.sheet, audit: run.audit, analysis: run.analysis, analysisCount: run.analysisCount });
        setPhase("done");
        if (!run.analysis && run.analysisCount < MAX_ANALYSES_PER_RUN) await runAnalysis(run.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "分析を開けませんでした");
        setPhase("error");
      }
    },
    [runAnalysis],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("この分析を削除しますか？")) return;
      try {
        await deleteRunRequest(id);
        if (loaded?.runId === id) {
          setLoaded(null);
          setPhase("idle");
        }
        void reloadMeta();
      } catch (err) {
        setError(err instanceof Error ? err.message : "削除できませんでした");
      }
    },
    [loaded, reloadMeta],
  );

  const busy = phase === "collecting" || phase === "analyzing";
  const keywordSlots = toSlots(form.keywords, MAX_KEYWORDS);
  const competitorSlots = toSlots(form.competitors, MAX_COMPETITORS);
  const quota = meta?.quota ?? null;
  const exhausted = quota ? !quota.unlimited && quota.used >= quota.limit : false;

  return (
    <>
      {meta && !meta.enabled && (
        <Callout tone="warn" title="サーバーの設定が足りません" className="mb-6">
          精密診断には <code className="font-mono">SUPABASE_URL</code> / <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>（保存と回数制限）と{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code>（専門家のアドバイス）が必要です。
        </Callout>
      )}
      {metaError && (
        <Callout tone="warn" className="mb-6">
          {metaError}
        </Callout>
      )}

      <Card
        className="mb-6"
        title="分析する"
        description="設定に登録したホームページを対象に、サイト全体のクロール・主要ページの速度・検索順位・ドメインの情報を集め、AI が現状分析と改善案を書きます。入力はすべて任意です（入れた分だけ分析が具体的になります）。"
        actions={
          quota ? (
            <Badge tone={exhausted ? "fail" : "neutral"} icon={false}>
              {quota.unlimited ? `運営者: 回数制限なし（今月 ${quota.used} 回実行）` : `今月の残り ${Math.max(0, quota.limit - quota.used)} 回（${quota.limit} 回まで）`}
            </Badge>
          ) : null
        }
      >
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <SiteTargetNotice what="精密診断" />

          <div className="grid gap-5 @2xl:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-bold text-ink">
                対策キーワード <span className="font-normal text-muted">（最大 {MAX_KEYWORDS} つ。設定の対策キーワードが入ります）</span>
              </legend>
              {keywordSlots.map((value, i) => (
                <Input
                  key={i}
                  id={`sa-kw-${i + 1}`}
                  aria-label={`対策キーワード ${i + 1}`}
                  value={value}
                  disabled={busy}
                  placeholder={`キーワード ${i + 1}`}
                  onChange={(e) => setForm({ ...form, keywords: withSlot(form.keywords, i, e.target.value, MAX_KEYWORDS) })}
                />
              ))}
            </fieldset>

            <div className="grid gap-3">
              <Field label="サイトの目的" htmlFor="sa-goal">
                <Select id="sa-goal" value={form.goal} disabled={busy} onChange={(e) => setForm({ ...form, goal: e.target.value as AnalysisGoal })}>
                  {(Object.keys(GOAL_LABELS) as AnalysisGoal[]).map((g) => (
                    <option key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 @md:grid-cols-2">
                <Field label="業種" htmlFor="sa-industry">
                  <Input id="sa-industry" value={form.industry} disabled={busy} placeholder="例: 歯科医院" onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                </Field>
                <Field label="地域" htmlFor="sa-region">
                  <Input id="sa-region" value={form.region} disabled={busy} placeholder="例: 東京都世田谷区" onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </Field>
              </div>
              <Field label="ブランド名" htmlFor="sa-brand" hint="空ならトップページの title から推定します">
                <Input id="sa-brand" value={form.brand} disabled={busy} placeholder="例: サンプル工房" onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-[13px] font-bold text-ink">
                  競合サイトの URL <span className="font-normal text-muted">（最大 {MAX_COMPETITORS} つ。設定の競合サイトが入ります）</span>
                </legend>
                {competitorSlots.map((value, i) => (
                  <Input
                    key={i}
                    id={`sa-comp-${i + 1}`}
                    aria-label={`競合サイト ${i + 1}`}
                    value={value}
                    disabled={busy}
                    inputMode="url"
                    placeholder={`https://example.co.jp/（競合 ${i + 1}）`}
                    onChange={(e) => setForm({ ...form, competitors: withSlot(form.competitors, i, e.target.value, MAX_COMPETITORS) })}
                  />
                ))}
              </fieldset>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={busy} disabled={!site.registered || exhausted || (meta !== null && !meta.enabled)}>
              分析する
            </Button>
            {busy && (
              <Button type="button" variant="secondary" size="lg" onClick={abort}>
                中止
              </Button>
            )}
            <span className="text-[12px] text-muted">全体で 3〜8 分。クロールは最大 {CRAWL_PAGE_LIMIT} ページ。1 回で今月の回数を 1 つ使います。</span>
          </div>
        </form>
      </Card>

      {busy && <DiagnosisMeter phase={phase === "collecting" ? "collecting" : "analyzing"} progress={progress} analyze={analyzeProgress} onAbort={abort} />}

      {meta && meta.runs.length > 0 && (
        <Card
          className="mb-6"
          title="診断の履歴"
          description="保存されている診断です。開くと報告書をそのまま読み直せます（アドバイスだけを作り直すこともできます）。"
        >
          <ul className="divide-y divide-line border-y border-line text-[13px]">
            {meta.runs.map((r: RunSummary) => {
              const current = loaded?.runId === r.id;
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-2 ${current ? "bg-accent-soft px-2" : ""}`}>
                  <span className="tabular-nums text-muted">{formatDateTime(r.createdAt)}</span>
                  <button type="button" className="font-bold text-accent underline-offset-2 hover:underline" onClick={() => void open(r.id)} disabled={busy}>
                    {hostOf(r.origin)}
                  </button>
                  <Badge tone={r.status === "analyzed" ? "pass" : r.status === "failed" ? "fail" : "neutral"} icon={false}>
                    {r.status === "analyzed" ? "アドバイスあり" : r.status === "failed" ? "失敗" : "診断のみ"}
                  </Badge>
                  {r.source === "auto" && (
                    <Badge tone="info" icon={false} title="前回から 30 日たったので、同じ条件で自動的に診断し直したもの">
                      自動
                    </Badge>
                  )}
                  {current && <Badge tone="info" icon={false}>表示中</Badge>}
                  {r.headline && <span className="min-w-0 flex-1 truncate text-muted">{r.headline}</span>}
                  <button type="button" className="ml-auto text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => void remove(r.id)}>
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {phase === "error" && error && (
        <Callout tone="fail" title="分析できませんでした" className="mb-6">
          {error}
        </Callout>
      )}

      {loaded && diff?.runId === loaded.runId && diff.diff && <DiffCard diff={diff.diff} />}

      {loaded ? (
        <ReportView
          sheet={loaded.sheet}
          audit={loaded.audit}
          analysis={loaded.analysis}
          analyzing={phase === "analyzing"}
          errors={{ analysis: analysisError }}
          onReanalyze={() => void runAnalysis(loaded.runId)}
          analysisCount={loaded.analysisCount}
          maxAnalyses={MAX_ANALYSES_PER_RUN}
        />
      ) : (
        phase !== "collecting" && (
          <EmptyState
            title="まだ分析していません"
            description="「分析する」を押すと、サイト全体をクロールして課題・速度・検索順位・ドメインの情報を集め、その数字だけを根拠に専門家のアドバイス（現状と改善案）を作ります。"
          />
        )
      )}

    </>
  );
}

/* ───────────────────── 進捗メーター ───────────────────── */

interface DiagnosisMeterProps {
  phase: "collecting" | "analyzing";
  progress: CollectProgressEvent | null;
  analyze: AnalyzeProgressEvent | null;
  onAbort: () => void;
}

/**
 * 診断全体（収集 4 段階 + 専門家のアドバイス）を 1 本のメーターで見せる（利用者の指示 2026-09-19）。
 * ステージが変わった時刻を覚えておき、時間で進むステージ（速度取得・アドバイス）は 1 秒ごとに描き直す。
 */
function DiagnosisMeter({ phase, progress, analyze, onAbort }: DiagnosisMeterProps) {
  const stage: DiagnosisStageId = phase === "analyzing" ? "analyze" : progress ? stageOfStep(progress.step) : "crawl";
  // ステージが変わった時刻（props から導く state。描画中に setState する React 公式のパターン）
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [stageStart, setStageStart] = useState<{ stage: DiagnosisStageId; at: number }>({ stage, at: startedAt });
  if (stageStart.stage !== stage) setStageStart({ stage, at: now });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stageElapsedMs = phase === "analyzing" && analyze ? analyze.elapsedMs : Math.max(0, now - stageStart.at);
  const p = diagnosisProgress({
    phase,
    step: progress?.step ?? null,
    audit: progress?.audit ? { fetched: progress.audit.fetched, queued: progress.audit.queued } : null,
    maxPages: CRAWL_PAGE_LIMIT,
    stageElapsedMs,
    outputChars: analyze?.outputChars,
  });
  const totalSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const states = stageStates(p.stage, false);

  return (
    <Card className="mb-6" title="診断しています" actions={<span className="text-[12px] tabular-nums text-muted">経過 {Math.floor(totalSec / 60)} 分 {String(totalSec % 60).padStart(2, "0")} 秒</span>}>
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] font-bold tabular-nums text-ink">{p.percent}%</span>
        <span className="text-[13px] text-muted">{p.detail}</span>
      </div>
      <ProgressBar value={p.percent} max={100} className="mt-2" />
      <ol className="mt-4 grid gap-1 text-[13px] @2xl:grid-cols-5">
        {states.map(({ stage: st, state }, i) => (
          <li key={st.id} className={`flex items-center gap-2 ${state === "todo" ? "text-muted" : "text-ink"}`}>
            <span
              aria-hidden
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                state === "done" ? "bg-pass text-white" : state === "active" ? "bg-accent text-white" : "border border-line text-muted"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span>{st.label}</span>
            {state === "active" && <span className="sr-only">（進行中）</span>}
          </li>
        ))}
      </ol>
      {phase === "analyzing" && analyze && analyze.attempt > 1 && (
        <p className="mt-3 text-[12px] text-muted">数値の照合で食い違いがあったため、書き直しています（{analyze.attempt} 回目）。</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={onAbort}>
          中止
        </Button>
        <span className="text-[12px] text-muted">
          {phase === "analyzing" ? "画面を閉じても分析はサーバーで続き、履歴から開けます。" : "収集中に中止すると、今月の回数は戻りません。"}
        </span>
      </div>
    </Card>
  );
}

