"use client";

/**
 * A1 サイト診断の画面。
 *
 * 外部連携は不要（サマリーの AI 生成だけ任意）なので、キーが 1 つも無い環境でも
 * 最初から最後まで動く。診断結果はブラウザに履歴として残し、次回の実行で
 * 「前回との差分」を出す。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
} from "@/components/ui";
import { diffIssues, withCategoryDelta, type AuditDiff } from "@/lib/audit/diff";
import {
  auditFormStore,
  auditHistoryStore,
  historyFor,
  saveRun,
  type AuditSnapshot,
} from "@/lib/audit/store";
import type { AuditProgress as Progress, AuditResult, AuditSummary } from "@/lib/audit/types";
import { fmt, formatDateTime, hostOf } from "@/lib/report";
import { useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { AuditCategoryTable } from "./AuditCategoryTable";
import { AuditIssues, type IssueRow } from "./AuditIssues";
import { AuditPages } from "./AuditPages";
import { AuditProgress } from "./AuditProgress";
import { AuditSummaryCard } from "./AuditSummaryCard";
import { AuditRequestError, requestAudit, requestAuditSummary } from "./client";

const PAGE_LIMITS = [20, 50, 100, 200, 300];

type Phase = "idle" | "running" | "error" | "done";

export function SiteAuditView() {
  const [form, setForm] = useStore(auditFormStore);
  const [history] = useStore(auditHistoryStore);
  const { status } = useIntegrations();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [cached, setCached] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [previous, setPrevious] = useState<AuditSnapshot | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [aiState, setAiState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  const controller = useRef<AbortController | null>(null);
  const startedAt = useRef(0);

  // 経過時間の表示だけのタイマー（結果には影響しない）
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (refresh: boolean) => {
      const url = form.url.trim();
      if (!url) {
        setError("診断するサイトの URL を入力してください");
        setPhase("error");
        return;
      }
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      startedAt.current = Date.now();
      setPhase("running");
      setError(null);
      setProgress(null);
      setElapsedMs(0);
      setAiState({ loading: false, error: null });

      try {
        const { result: next, cached: fromCache } = await requestAudit(url, {
          maxPages: form.maxPages,
          refresh,
          signal: ac.signal,
          onProgress: setProgress,
        });
        if (ac.signal.aborted) return;
        // 保存は結果を受け取ってから。戻り値が「前回」の履歴になる
        const before = saveRun(next);
        setPrevious(before);
        setResult(next);
        setSummary(next.summary ?? null);
        setCached(fromCache);
        setPhase("done");
      } catch (err) {
        if (ac.signal.aborted) return;
        setError(
          err instanceof AuditRequestError || err instanceof Error
            ? err.message
            : "診断に失敗しました",
        );
        setPhase("error");
      } finally {
        if (controller.current === ac) controller.current = null;
      }
    },
    [form.url, form.maxPages],
  );

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setPhase("idle");
    setProgress(null);
  }, []);

  const generateSummary = useCallback(async () => {
    if (!result) return;
    setAiState({ loading: true, error: null });
    try {
      const next = await requestAuditSummary(result);
      if (next) {
        setSummary(next);
        setAiState({ loading: false, error: null });
      } else {
        // 503（キー未設定）。ルール生成のサマリーはそのまま残す
        setAiState({ loading: false, error: "ANTHROPIC_API_KEY が未設定のため AI サマリーは生成できません" });
      }
    } catch (err) {
      setAiState({
        loading: false,
        error: err instanceof Error ? err.message : "AI サマリーの生成に失敗しました",
      });
    }
  }, [result]);

  // 今回実際に診断できた URL。前回の課題を「解消」と言い切ってよいかの判断に使う
  const checkedUrls = useMemo(() => {
    if (!result) return null;
    const urls = new Set<string>([result.origin, result.startUrl]);
    for (const page of result.pages) {
      urls.add(page.url);
      urls.add(page.finalUrl);
    }
    return urls;
  }, [result]);

  const diff: AuditDiff | null = useMemo(
    () => (result && previous ? diffIssues(result.issues, previous.issues, checkedUrls) : null),
    [result, previous, checkedUrls],
  );

  const issueRows: IssueRow[] = useMemo(() => {
    if (!result) return [];
    if (!diff) return result.issues.map((issue) => ({ ...issue }));
    const changes = new Map(diff.entries.map((e) => [`${e.ruleId} ${e.url}`, e]));
    const rows: IssueRow[] = result.issues.map((issue) => ({
      ...issue,
      change: changes.get(`${issue.ruleId} ${issue.url}`)?.change,
    }));
    // 解消・未確認の課題は今回の一覧に無いので、差分から補って並べる。
    // 今回クロールしていないページの課題に「解消しています」とは書かない
    for (const entry of diff.entries) {
      if (entry.change !== "resolved" && entry.change !== "unchecked") continue;
      rows.push({
        ruleId: entry.ruleId,
        category: entry.category,
        severity: entry.severity,
        url: entry.url,
        detail: entry.detail,
        suggestion:
          entry.change === "resolved"
            ? "前回の診断では検出されていましたが、今回は解消しています。"
            : "前回の診断では検出されていましたが、今回はこのページをクロールしていないため解消したかどうかは分かりません。上限ページ数を上げて再診断してください。",
        change: entry.change,
      });
    }
    return rows;
  }, [result, diff]);

  const categories = useMemo(
    () => (result ? withCategoryDelta(result.byCategory, previous?.byCategory ?? null) : []),
    [result, previous],
  );

  const pastRuns = useMemo(
    () => (result ? historyFor(history, result.origin) : []),
    [history, result],
  );

  const disabled = phase === "running";

  return (
    <>
      <Card
        className="mb-6"
        title="診断するサイト"
        description="開始 URL から sitemap と内部リンクをたどってページを集め、テクニカル SEO のルールを適用します。外部 API は使いません。"
      >
        <form
          className="grid gap-3 @2xl:grid-cols-[1fr_10rem_auto] @2xl:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(false);
          }}
        >
          <Field label="サイトの URL" htmlFor="audit-url" required hint="例: example.co.jp／https://example.co.jp/">
            <Input
              id="audit-url"
              value={form.url}
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.co.jp/"
              disabled={disabled}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </Field>
          <Field label="上限ページ数" htmlFor="audit-max-pages" hint="サーバー側の上限まで">
            <Select
              id="audit-max-pages"
              value={String(form.maxPages)}
              disabled={disabled}
              onChange={(e) => setForm({ ...form, maxPages: Number(e.target.value) })}
            >
              {PAGE_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} ページ
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" loading={disabled} className="w-full @2xl:w-auto">
              診断する
            </Button>
            {phase === "done" && (
              <Button variant="secondary" size="lg" disabled={disabled} onClick={() => void run(true)}>
                再取得
              </Button>
            )}
          </div>
        </form>
      </Card>

      {phase === "running" && (
        <AuditProgress progress={progress} elapsedMs={elapsedMs} onAbort={abort} />
      )}

      {phase === "error" && error && (
        <Callout tone="fail" title="診断できませんでした" className="mb-6">
          {error}
        </Callout>
      )}

      {phase !== "running" && !result && (
        <EmptyState
          title="まだ診断していません"
          description="URL を入れて「診断する」を押すと、サイト全体をクロールして課題を一覧にします。300 ページで数分かかることがあります。"
        />
      )}

      {result && (
        <div className="space-y-6">
          {cached && (
            <p className="text-[12px] text-muted">
              直近の診断結果を表示しています（サーバーのキャッシュ）。取り直すには「再取得」を押してください。
            </p>
          )}

          <div className="grid gap-3 @2xl:grid-cols-4">
            <StatCard
              label="対象サイト"
              value={<span className="text-base break-all">{hostOf(result.origin)}</span>}
              hint={formatDateTime(result.crawledAt)}
            />
            <StatCard
              label="総ページ数"
              value={fmt(result.crawl.analyzed)}
              unit="ページ"
              hint={`発見 ${fmt(result.crawl.discovered)} / 取得 ${fmt(result.crawl.fetched)}`}
            />
            <StatCard
              label="検出された課題数"
              value={fmt(result.issues.length)}
              unit="件"
              hint={`重大 ${result.bySeverity.error} / 警告 ${result.bySeverity.warning} / 情報 ${result.bySeverity.info}`}
            />
            <StatCard
              label="前回比"
              value={
                previous ? (
                  <span className={deltaColor(result.issues.length - previous.issueCount)}>
                    {formatDelta(result.issues.length - previous.issueCount)}
                  </span>
                ) : (
                  "—"
                )
              }
              unit={previous ? "件" : undefined}
              hint={
                diff
                  ? `新規 ${diff.counts.new} / 継続 ${diff.counts.kept} / 解消 ${diff.counts.resolved}${
                      diff.counts.unchecked > 0 ? ` / 未確認 ${diff.counts.unchecked}` : ""
                    }`
                  : "履歴がまだ 1 回分のため比較できません"
              }
            />
          </div>

          {result.crawl.truncated && (
            <Callout tone="info">
              {result.crawl.truncated.reason === "max-pages"
                ? `上限の ${result.crawl.truncated.limit} ページに達したため、途中で打ち切りました。`
                : "時間の上限に達したため、途中で打ち切りました。"}
              サイト全体を見るには上限を上げて実行してください。
            </Callout>
          )}

          {summary && (
            <AuditSummaryCard
              summary={summary}
              aiEnabled={status ? status.anthropic : null}
              aiState={aiState}
              onGenerate={() => void generateSummary()}
            />
          )}

          <AuditCategoryTable rows={categories} hasPrevious={Boolean(previous)} />

          <AuditIssues issues={issueRows} origin={result.origin} hasPrevious={Boolean(diff)} />

          <AuditPages pages={result.pages} failures={result.failures} />

          {pastRuns.length > 1 && (
            <Card title="診断の履歴" description="このブラウザに保存されている直近の実行結果です。">
              <ul className="divide-y divide-line border-y border-line text-[13px]">
                {pastRuns.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="tabular-nums text-ink">{formatDateTime(run.crawledAt)}</span>
                    <span className="tabular-nums text-muted">{fmt(run.analyzed)} ページ</span>
                    <span className="tabular-nums text-muted">課題 {fmt(run.issueCount)} 件</span>
                    <span className="text-[12px] text-muted">
                      重大 {run.bySeverity.error} / 警告 {run.bySeverity.warning} / 情報 {run.bySeverity.info}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {result.notes.length > 0 && (
            <Card title="診断時の注記">
              <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Card>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            <Badge tone="neutral">診断範囲</Badge> 公開 HTML・robots.txt・sitemap.xml を対象とした自動診断です。
            リンク切れの確認は最大 80 URL、取得時間の実測は最大 10 ページに絞っています（対象サイトへの負荷を抑えるため）。
          </p>
        </div>
      )}
    </>
  );
}

function formatDelta(delta: number): string {
  if (delta === 0) return "±0";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

function deltaColor(delta: number): string {
  if (delta === 0) return "text-muted";
  return delta > 0 ? "text-fail" : "text-pass";
}
