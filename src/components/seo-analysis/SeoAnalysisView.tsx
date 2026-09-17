"use client";

/**
 * 精密診断の画面。
 *
 * 流れ: 入力 → 収集（NDJSON で進捗）→ AI 分析（別リクエスト）→ セカンドオピニオン（任意）→ 報告書。
 * 収集と分析を分けているのは、サーバーの実行時間の上限に収めるためと、
 * 同じ事実シートで AI 分析だけをやり直せるようにするため。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import type { AuditResult } from "@/lib/audit/types";
import type { AnalysisRecord, SecondOpinionRecord } from "@/lib/seo-analysis/ai/schema";
import { MAX_COMPETITORS, MAX_KEYWORDS, PAGE_LIMITS } from "@/lib/seo-analysis/input";
import { MAX_ANALYSES_PER_RUN } from "@/lib/seo-analysis/limits";
import type { RunSummary } from "@/lib/seo-analysis/runs";
import { GOAL_LABELS, type AnalysisGoal, type AnalysisInput, type SeoFactSheet } from "@/lib/seo-analysis/sheet/types";
import { seoAnalysisFormStore, splitLines } from "@/lib/seo-analysis/store";
import { SiteTargetNotice, useRegisteredSite } from "@/components/site/RegisteredSite";
import { formatDateTime, hostOf } from "@/lib/report";
import { useStore } from "@/lib/store/hooks";
import { ReportView } from "./ReportView";
import {
  deleteRunRequest,
  fetchRun,
  fetchRuns,
  requestAnalyze,
  requestCollect,
  requestSecondOpinion,
  SeoAnalysisError,
  type CollectProgressEvent,
  type RunsResponse,
} from "./client";

type Phase = "idle" | "collecting" | "analyzing" | "done" | "error";

const STEP_LABELS: Record<string, string> = {
  crawl: "1/4 クロール",
  quick: "2/4 トップページの採点",
  speed: "3/4 速度・検索・ドメイン・llms.txt",
  search: "3/4 速度・検索・ドメイン・llms.txt",
  domain: "3/4 速度・検索・ドメイン・llms.txt",
  llms: "3/4 速度・検索・ドメイン・llms.txt",
  google: "3/4 速度・検索・ドメイン・llms.txt",
  sheet: "4/4 事実シート",
};

interface Loaded {
  runId: string;
  sheet: SeoFactSheet;
  audit: AuditResult | null;
  analysis: AnalysisRecord | null;
  secondOpinion: SecondOpinionRecord | null;
  analysisCount: number;
}

export function SeoAnalysisView() {
  const [form, setForm] = useStore(seoAnalysisFormStore);
  // 分析するサイトは設定に登録したホームページ。この画面では URL を聞かない（競合だけ残す）
  const site = useRegisteredSite();
  const [meta, setMeta] = useState<RunsResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CollectProgressEvent | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [soState, setSoState] = useState<"idle" | "loading" | "disabled" | "done" | "error">("idle");
  const [soError, setSoError] = useState<string | null>(null);
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

  const runSecondOpinion = useCallback(
    async (runId: string) => {
      if (meta && !meta.secondOpinion) {
        setSoState("disabled");
        return;
      }
      setSoState("loading");
      setSoError(null);
      try {
        const so = await requestSecondOpinion(runId);
        if (!so) {
          setSoState("disabled");
          return;
        }
        setLoaded((prev) => (prev && prev.runId === runId ? { ...prev, secondOpinion: so } : prev));
        setSoState("done");
      } catch (err) {
        setSoError(err instanceof Error ? err.message : "セカンドオピニオンの生成に失敗しました");
        setSoState("error");
      }
    },
    [meta],
  );

  const runAnalysis = useCallback(
    async (runId: string) => {
      setPhase("analyzing");
      setAnalysisError(null);
      try {
        const { analysis, analysisCount } = await requestAnalyze(runId);
        setLoaded((prev) => (prev && prev.runId === runId ? { ...prev, analysis, analysisCount } : prev));
        setPhase("done");
        void reloadMeta();
        void runSecondOpinion(runId);
      } catch (err) {
        setAnalysisError(err instanceof Error ? err.message : "AI 分析に失敗しました");
        setPhase("done");
      }
    },
    [reloadMeta, runSecondOpinion],
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
      keywords: splitLines(form.keywords, MAX_KEYWORDS),
      industry: form.industry.trim(),
      goal: form.goal,
      region: form.region.trim(),
      competitors: splitLines(form.competitors, MAX_COMPETITORS),
      brand: form.brand.trim(),
      maxPages: form.maxPages,
    };
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setPhase("collecting");
    setError(null);
    setProgress(null);
    setLoaded(null);
    setAnalysisError(null);
    setSoState("idle");
    setSoError(null);
    try {
      const { run, sheet, audit } = await requestCollect(input, { signal: ac.signal, onProgress: setProgress });
      if (ac.signal.aborted) return;
      setLoaded({ runId: run.id, sheet, audit, analysis: null, secondOpinion: null, analysisCount: 0 });
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
    setPhase("idle");
    setProgress(null);
  }, []);

  const open = useCallback(
    async (id: string) => {
      setError(null);
      setAnalysisError(null);
      setSoError(null);
      try {
        const run = await fetchRun(id);
        setLoaded({ runId: run.id, sheet: run.sheet, audit: run.audit, analysis: run.analysis, secondOpinion: run.secondOpinion, analysisCount: run.analysisCount });
        setSoState(run.secondOpinion ? "done" : meta && !meta.secondOpinion ? "disabled" : "idle");
        setPhase("done");
        if (!run.analysis && run.analysisCount < MAX_ANALYSES_PER_RUN) await runAnalysis(run.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "分析を開けませんでした");
        setPhase("error");
      }
    },
    [meta, runAnalysis],
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
  const quota = meta?.quota ?? null;
  const exhausted = quota ? !quota.unlimited && quota.used >= quota.limit : false;

  return (
    <>
      {meta && !meta.enabled && (
        <Callout tone="warn" title="サーバーの設定が足りません" className="mb-6">
          精密診断には <code className="font-mono">SUPABASE_URL</code> / <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>（保存と回数制限）と{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code>（AI 分析）が必要です。
        </Callout>
      )}
      {metaError && (
        <Callout tone="warn" className="mb-6">
          {metaError}
        </Callout>
      )}

      <Card
        className="mb-6"
        title="分析するサイト"
        description="設定に登録したホームページを対象にします。サイト全体のクロール（旧・サイト診断: 48 ルールの課題一覧・ページ一覧・CSV は報告書の「詳細」に出ます）に、速度・検索順位・Google 連携の数字を足して AI が分析します。キーワード・業種・目的・競合を入れると、その分だけ分析が具体的になります。"
        actions={
          quota ? (
            <Badge tone={exhausted ? "fail" : "neutral"} icon={false}>
              {quota.unlimited ? `今月 ${quota.used} 回（運営者: 無制限）` : `今月 ${quota.used} / ${quota.limit} 回`}
            </Badge>
          ) : null
        }
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <SiteTargetNotice what="精密診断" />
          <div className="grid gap-3 @2xl:grid-cols-[10rem_1fr]">
            <Field label="クロールの上限" htmlFor="sa-max" hint="多いほど時間がかかります">
              <Select id="sa-max" value={String(form.maxPages)} disabled={busy} onChange={(e) => setForm({ ...form, maxPages: Number(e.target.value) })}>
                {PAGE_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n} ページ
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 @2xl:grid-cols-3">
            <Field label={`対策キーワード（最大 ${MAX_KEYWORDS}・任意）`} htmlFor="sa-kw" hint="1 行に 1 つ。順位と検索結果の特徴を取ります（SerpApi）">
              <Textarea id="sa-kw" rows={4} value={form.keywords} disabled={busy} placeholder={"世田谷区 歯医者\n歯科 矯正 費用"} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            </Field>
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
              <Field label="業種（任意）" htmlFor="sa-industry">
                <Input id="sa-industry" value={form.industry} disabled={busy} placeholder="例: 歯科医院、税理士事務所、EC（アパレル）" onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3">
              <Field label="地域（任意）" htmlFor="sa-region">
                <Input id="sa-region" value={form.region} disabled={busy} placeholder="例: 東京都世田谷区" onChange={(e) => setForm({ ...form, region: e.target.value })} />
              </Field>
              <Field label="ブランド名（任意）" htmlFor="sa-brand" hint="空ならトップページの title から推定">
                <Input id="sa-brand" value={form.brand} disabled={busy} placeholder="例: サンプル工房" onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label={`競合サイトの URL（最大 ${MAX_COMPETITORS}・任意）`} htmlFor="sa-comp" hint="1 行に 1 つ。キーワードごとの順位を並べます">
                <Textarea id="sa-comp" rows={2} value={form.competitors} disabled={busy} onChange={(e) => setForm({ ...form, competitors: e.target.value })} />
              </Field>
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
            <span className="text-[12px] text-muted">収集に 1〜5 分、AI 分析に 1〜3 分かかります。1 回で今月の回数を 1 つ使います。</span>
          </div>
        </form>
      </Card>

      {phase === "collecting" && (
        <Card className="mb-6" title="収集しています">
          <p className="text-sm text-ink">
            {progress ? `${STEP_LABELS[progress.step] ?? progress.step}: ${progress.message}` : "開始しています"}
          </p>
          {progress?.audit && (
            <p className="mt-1 text-[12px] tabular-nums text-muted">
              取得 {progress.audit.fetched} / 発見 {progress.audit.discovered} / 待ち {progress.audit.queued}
              {progress.audit.url ? ` ／ ${progress.audit.url}` : ""}
            </p>
          )}
        </Card>
      )}

      {phase === "error" && error && (
        <Callout tone="fail" title="分析できませんでした" className="mb-6">
          {error}
        </Callout>
      )}

      {loaded ? (
        <ReportView
          sheet={loaded.sheet}
          audit={loaded.audit}
          analysis={loaded.analysis}
          secondOpinion={loaded.secondOpinion}
          analyzing={phase === "analyzing"}
          secondOpinionState={soState}
          errors={{ analysis: analysisError, secondOpinion: soError }}
          onReanalyze={() => void runAnalysis(loaded.runId)}
          onSecondOpinion={() => void runSecondOpinion(loaded.runId)}
          analysisCount={loaded.analysisCount}
          maxAnalyses={MAX_ANALYSES_PER_RUN}
        />
      ) : (
        phase !== "collecting" && (
          <EmptyState
            title="まだ分析していません"
            description="「分析する」を押すと、設定に登録したホームページについて、サイト全体のクロール・主要ページの速度・検索順位・Google 連携の数字を事実シートにまとめ、AI が現状分析と改善案を書きます。"
          />
        )
      )}

      {meta && meta.runs.length > 0 && (
        <Card className="mt-6" title="分析の履歴" description="保存されている分析です。開くと報告書を再表示します（AI 分析はやり直せます）。">
          <ul className="divide-y divide-line border-y border-line text-[13px]">
            {meta.runs.map((r: RunSummary) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => void open(r.id)}>
                  {hostOf(r.origin)}
                </button>
                <span className="tabular-nums text-muted">{formatDateTime(r.createdAt)}</span>
                <Badge tone={r.status === "analyzed" ? "pass" : r.status === "failed" ? "fail" : "neutral"} icon={false}>
                  {r.status === "analyzed" ? "分析済み" : r.status === "failed" ? "失敗" : "収集のみ"}
                </Badge>
                {r.headline && <span className="min-w-0 flex-1 truncate text-muted">{r.headline}</span>}
                <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => void remove(r.id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
