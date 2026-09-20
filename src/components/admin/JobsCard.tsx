"use client";

/**
 * 定期処理（Cron）の状況。運用者だけが見るマスター画面に置く。
 *
 * 「昨日ちゃんと動いたか」を確かめる場所。ジョブごとに予定・次回・最後の結果を出し、
 * 「今すぐ実行」で予定日に関係なく 1 本だけ動かせる（実費の出る処理もそのまま動く）。
 */
import { useCallback, useEffect, useState } from "react";
import type { AdminJobsResponse } from "@/app/api/admin/jobs/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import type { JobOutcome, JobId } from "@/lib/jobs/types";
import { formatDateTime } from "@/lib/report/format";

const STATUS_TONE: Record<string, "pass" | "fail" | "warn" | "neutral"> = { ok: "pass", failed: "fail", aborted: "warn", skipped: "neutral", running: "neutral" };
const STATUS_LABEL: Record<string, string> = { ok: "成功", failed: "失敗", aborted: "時間切れ（残りは次回）", skipped: "飛ばした", running: "実行中" };

async function fetchJobs(): Promise<AdminJobsResponse> {
  const res = await fetch("/api/admin/jobs", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AdminJobsResponse;
}

export function JobsCard() {
  const [data, setData] = useState<AdminJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<JobId | null>(null);
  const [result, setResult] = useState<JobOutcome[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchJobs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchJobs()
      .then((body) => {
        if (!alive) return;
        setData(body);
        setError(null);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "読み込めませんでした");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function runNow(job: JobId) {
    if (!window.confirm("このジョブを今すぐ動かします。外部 API の実費が出る処理もそのまま動きます。よろしいですか？")) return;
    setRunning(job);
    setResult(null);
    try {
      const res = await fetch("/api/admin/jobs/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) });
      const body = (await res.json().catch(() => ({}))) as { outcomes?: JobOutcome[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body.outcomes ?? []);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "実行できませんでした");
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card
      title="定期処理（Cron）の状況"
      description="毎日 5:00 に /api/cron/daily が動き、曜日・日付でジョブを振り分けます（Vercel Hobby は Cron 2 本まで）。AI 検索モニタリングだけは別の Cron（/api/cron/geo-run）です。"
      actions={
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          再読み込み
        </Button>
      }
    >
      {error && (
        <Callout tone="warn" className="mb-4">
          {error}
        </Callout>
      )}
      {data && !data.cronConfigured && (
        <Callout tone="warn" title="CRON_SECRET が未設定です" className="mb-4">
          Vercel の環境変数に CRON_SECRET を登録して Redeploy するまで、Cron からの呼び出しは何もしません。
        </Callout>
      )}
      {data && (
        <ul className="divide-y divide-line border-y border-line">
          {data.jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
              <span className="min-w-0 basis-full @lg:basis-auto">
                <span className="font-bold text-ink">{j.label}</span>
                <span className="ml-2 text-[11px] text-muted">{j.cadence}</span>
                <span className="mt-0.5 block text-[12px] text-muted">{j.description}</span>
              </span>
              <span className="text-[12px] text-muted">次回 {formatDateTime(j.nextAt)}</span>
              <span className="flex items-center gap-1.5">
                {j.last ? (
                  <>
                    <Badge tone={STATUS_TONE[j.last.status] ?? "neutral"} icon={false}>
                      {STATUS_LABEL[j.last.status] ?? j.last.status}
                    </Badge>
                    <span className="text-[11px] text-muted">{formatDateTime(j.last.startedAt)}</span>
                  </>
                ) : (
                  <Badge tone="neutral" icon={false}>
                    まだ動いていません
                  </Badge>
                )}
              </span>
              <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void runNow(j.id)} loading={running === j.id} disabled={running !== null || !data.dbConfigured}>
                今すぐ実行
              </Button>
              {j.last && Object.keys(j.last.summary).length > 0 && (
                <details className="basis-full text-[11px] text-muted">
                  <summary className="cursor-pointer">前回の内容</summary>
                  <pre className="mt-1 overflow-x-auto rounded-sm border border-line bg-surface p-2 font-mono">{JSON.stringify(j.last.summary, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {result && (
        <div className="mt-4 rounded-sm border border-line bg-surface p-3 text-[12px]">
          <p className="font-bold text-ink">実行結果</p>
          <pre className="mt-1 overflow-x-auto font-mono text-muted">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}
