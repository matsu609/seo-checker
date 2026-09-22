"use client";

/**
 * サイトの事故監視の画面。最新の確認結果（事故の一覧・ページごとの状態・リンク切れ・SSL）と履歴。
 * 「今すぐ確認」は毎週水曜の自動確認と同じ中身（知らせは出さない）。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにして、デモデータを入れて、
 * 最初からこう表示されると分かるように」。履歴は日付と件数の箇条書きだったので**折れ線**にし、
 * まだ 2 回確認していないときは破線のイメージを描く。
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MonitorResponse } from "@/app/api/monitor/route";
import { LineChart, SampleBadge, SampleChart } from "@/components/charts";
import { Badge, Button, Callout, Card, DataTable, EmptyState, StatStrip, type Column } from "@/components/ui";
import { dayLabel } from "@/lib/demo/dates";
import { sampleIncidentChecks } from "@/lib/demo/site";
import { jstDateKey } from "@/lib/time/jst";
import { INCIDENT_LABELS, type Incident, type MonitorDiff, type MonitorSnapshot, type PageCheck } from "@/lib/monitor/types";
import { formatDateTime } from "@/lib/report/format";
import { useRegisteredSite } from "@/components/site/RegisteredSite";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // JSON でない
  }
  return `HTTP ${res.status}`;
}

async function fetchMonitor(): Promise<MonitorResponse> {
  const res = await fetch("/api/monitor", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as MonitorResponse;
}

function IncidentList({ items, tone }: { items: readonly Incident[]; tone: "fail" | "warn" | "pass" }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-[13px]">
      {items.map((i) => (
        <li key={`${i.kind}${i.url ?? ""}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Badge tone={tone === "pass" ? "pass" : i.severity === "critical" ? "fail" : "warn"} icon={false}>
            {i.severity === "critical" ? "重大" : "注意"}
          </Badge>
          <span className="font-bold text-ink">{INCIDENT_LABELS[i.kind]}</span>
          {i.url && (
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] text-accent underline-offset-2 hover:underline">
              {i.url}
            </a>
          )}
          <span className="text-muted">{i.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function MonitorTool() {
  const site = useRegisteredSite();
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchMonitor());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMonitor()
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

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/monitor/run", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { latest: MonitorSnapshot; diff: MonitorDiff };
      setData((prev) => (prev ? { ...prev, latest: body.latest, diff: body.diff } : prev));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認できませんでした");
    } finally {
      setRunning(false);
    }
  }

  const latest = data?.latest ?? null;
  const diff = data?.diff ?? null;
  const critical = latest ? latest.incidents.filter((i) => i.severity === "critical").length : 0;

  const pageColumns: Column<PageCheck>[] = [
    { key: "url", header: "ページ", render: (p) => <span className="break-all text-[12px]">{p.home ? "トップ " : ""}{p.url}</span> },
    { key: "status", header: "HTTP", align: "center", width: "4.5rem", render: (p) => (p.status === null ? <span className="text-fail">失敗</span> : <span className={p.status >= 400 ? "text-fail" : ""}>{p.status}</span>) },
    { key: "ms", header: "取得", align: "right", width: "5rem", render: (p) => (p.ms === null ? "—" : `${(p.ms / 1000).toFixed(1)} 秒`) },
    { key: "index", header: "検索に載せる", align: "center", width: "7rem", render: (p) => (p.noindex || !p.robotsAllowed ? <Badge tone="fail" icon={false}>{p.noindex ? "noindex" : "robots 拒否"}</Badge> : <Badge tone="pass" icon={false}>可</Badge>) },
    { key: "title", header: "title", render: (p) => <span className="text-[12px] text-muted">{p.title ?? "（無し）"}</span> },
    { key: "jsonld", header: "構造化データ", align: "center", width: "6rem", render: (p) => (p.jsonLdBlocks === 0 ? <span className="text-muted">—</span> : p.jsonLdErrors > 0 ? <span className="text-fail">{p.jsonLdErrors} 件エラー</span> : `${p.jsonLdBlocks} 件`) },
  ];

  return (
    <div className="space-y-6">
      {!site.registered && (
        <Callout tone="info" title="ホームページの URL が未登録です">
          <Link href="/settings" className="font-bold text-accent underline-offset-2 hover:underline">
            設定画面で登録する
          </Link>
          と、毎週水曜 5:00 に主要ページを確認して、事故が起きたときに知らせます。
        </Callout>
      )}

      <Card
        title="いまの状態"
        description={data ? `毎週水曜 5:00 に自動で確認します（次回 ${formatDateTime(data.nextRunAt)}）。前回は無かった事故だけを「お知らせ」（設定でメールも可）で知らせます。` : "読み込んでいます…"}
        actions={
          <Button onClick={() => void runNow()} loading={running} disabled={!site.registered || (data !== null && !data.enabled)}>
            今すぐ確認する
          </Button>
        }
      >
        {error && (
          <Callout tone="fail" className="mb-4">
            {error}
          </Callout>
        )}
        {data && !data.enabled && <Callout tone="info">サイト監視の保存先（Supabase）が未設定のため、いまは動いていません。</Callout>}
        {data?.enabled && !latest && !running && (
          <EmptyState title="まだ確認していません" description="「今すぐ確認する」を押すか、次回の水曜 5:00 をお待ちください。" />
        )}
        {latest && (
          <>
            <StatStrip
              items={[
                { label: "判定", value: critical > 0 ? "要対応" : latest.incidents.length > 0 ? "注意" : "正常", className: critical > 0 ? "text-fail" : "" },
                { label: "重大な事故", value: critical, unit: "件" },
                { label: "注意", value: latest.incidents.length - critical, unit: "件" },
                { label: "SSL の残り", value: latest.ssl?.daysLeft ?? "—", unit: latest.ssl?.daysLeft === null || latest.ssl === null ? "" : "日" },
                { label: "確認したページ", value: latest.pages.length, unit: "件" },
              ]}
            />
            <p className="mt-2 text-[11px] text-muted">最終確認 {formatDateTime(latest.checkedAt)}。対象: トップページ + 直近の精密診断で重要度の高いページ（最大 10）+ トップから張られた内部リンク（最大 30）。</p>
          </>
        )}
      </Card>

      {latest && (
        <Card title="事故と注意" description="前回との差分で見ます。「新しく起きた」を最優先で直してください。">
          {latest.incidents.length === 0 && diff?.resolved.length === 0 && <p className="text-[13px] text-pass">問題は見つかりませんでした。</p>}
          {diff && diff.opened.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1.5 text-[13px] font-bold text-ink">新しく起きた（{diff.opened.length}）</h3>
              <IncidentList items={diff.opened} tone="fail" />
            </div>
          )}
          {diff && diff.ongoing.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-1.5 text-[13px] font-bold text-ink">前回から続いている（{diff.ongoing.length}）</h3>
              <IncidentList items={diff.ongoing} tone="warn" />
            </div>
          )}
          {diff && diff.resolved.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[13px] font-bold text-ink">直った（{diff.resolved.length}）</h3>
              <IncidentList items={diff.resolved} tone="pass" />
            </div>
          )}
        </Card>
      )}

      {latest && (
        <Card title="ページごとの状態" headingLevel={2}>
          <DataTable rows={latest.pages} columns={pageColumns} rowKey={(p) => p.url} dense minWidth="52rem" emptyText="" />
          {latest.links.checked > 0 && (
            <p className="mt-3 text-[12px] text-muted">
              トップから張られた内部リンク {latest.links.checked} 本を確認。切れているもの {latest.links.broken.length} 本
              {latest.links.broken.length > 0 && <>: {latest.links.broken.map((l) => `${l.url}（${l.status ?? l.error ?? "失敗"}）`).join("、")}</>}
            </p>
          )}
          <p className="mt-1 text-[12px] text-muted">
            サイトマップ: {latest.sitemap.ok ? "取得できました" : `取得できません（${latest.sitemap.status ?? "接続失敗"}）`} ／ robots.txt: {latest.robots.fetched ? (latest.robots.blocksAll ? "サイト全体を拒否" : "あり") : "無し（すべて許可の扱い）"}
            {latest.ssl && <> ／ SSL: {latest.ssl.error ? latest.ssl.error : latest.ssl.validTo ? `${formatDateTime(latest.ssl.validTo)} まで` : "不明"}</>}
          </p>
        </Card>
      )}

      {data?.enabled && (
        <Card
          title="事故の件数の推移"
          headingLevel={2}
          description="確認のたびに、見つかった事故（重大 + 注意）の件数を並べます。0 件が続いているのが正常です。"
          actions={data.history.length < 2 ? <SampleBadge label="イメージ（確認がまだ 1 回以下です）" /> : undefined}
        >
          {data.history.length < 2 ? (
            <IncidentSample checked={data.history.length} />
          ) : (
            <>
              <LineChart
                labels={[...data.history].reverse().map((h) => dayLabel(jstDateKey(new Date(h.checkedAt))))}
                series={[{ id: "incidents", label: "事故の件数", values: [...data.history].reverse().map((h) => h.incidents), fill: true }]}
                yMin={0}
                height={200}
                format={(v) => (v === null ? "—" : `${Math.round(v)} 件`)}
                xHeader="確認日"
                ariaLabel="確認のたびに見つかった事故の件数の推移"
              />
              <ul className="mt-4 divide-y divide-line border-y border-line text-[13px]">
                {data.history.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-1.5">
                    <span className="tabular-nums text-muted">{formatDateTime(h.checkedAt)}</span>
                    <Badge tone={h.incidents === 0 ? "pass" : "warn"} icon={false}>
                      {h.incidents === 0 ? "問題なし" : `${h.incidents} 件`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

/* ───────────── 確認前のイメージ（破線） ───────────── */

function IncidentSample({ checked }: { checked: number }) {
  const { dates, incidents } = sampleIncidentChecks();
  return (
    <SampleChart
      lead={
        checked === 0
          ? "まだ 1 回も確認していません。「今すぐ確認する」を押すか、毎週水曜 5:00 の自動確認を待つと、この形の実線に置き換わります。"
          : "確認は 1 回ぶんだけです。線としてつながるのは 2 回目からです。"
      }
      note={
        <>
          縦軸は見つかった事故の件数（重大 + 注意）、横軸は確認日です。
          <strong className="font-bold">0 件が続いているのが正常</strong>で、線が跳ね上がった週に何が起きたかを上の「事故と注意」で確かめます。
          毎週水曜 5:00 に自動で確認し、前回は無かった事故だけをお知らせします。
        </>
      }
    >
      <LineChart
        labels={dates.map(dayLabel)}
        series={[{ id: "sample-incidents", label: "事故の件数", values: incidents, dashed: true }]}
        yMin={0}
        yMax={4}
        yTicks={[0, 1, 2, 3, 4]}
        height={200}
        format={(v) => (v === null ? "—" : `${Math.round(v)} 件`)}
        xHeader="確認日（水曜）"
        ariaLabel="確認を重ねたあとの見え方のイメージ（実測ではありません）。縦軸は事故の件数、横軸はこれからの 4 回"
      />
    </SampleChart>
  );
}
