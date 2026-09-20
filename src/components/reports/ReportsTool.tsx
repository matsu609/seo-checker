"use client";

/**
 * 月次レポートの画面（数字の前月比・来月やること・PDF）と、お知らせの一覧。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NotificationsResponse } from "@/app/api/notifications/route";
import type { ReportsResponse } from "@/app/api/reports/route";
import { Badge, Button, Callout, Card, EmptyState, Select, StatCard } from "@/components/ui";
import { NOTIFICATION_KIND_LABELS } from "@/lib/notifications/types";
import { downloadPdf } from "@/lib/pdf/download";
import type { RankChange, ReportDelta } from "@/lib/reports/types";
import { formatDateTime } from "@/lib/report/format";
import { monthLabel } from "@/lib/time/jst";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // JSON でない
  }
  return `HTTP ${res.status}`;
}

async function fetchReport(m: string | null): Promise<ReportsResponse> {
  const res = await fetch(`/api/reports${m ? `?month=${encodeURIComponent(m)}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ReportsResponse;
}

async function fetchNotifications(): Promise<NotificationsResponse | null> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    return res.ok ? ((await res.json()) as NotificationsResponse) : null;
  } catch {
    // 出せなくても本体は動く
    return null;
  }
}

function deltaOf(d: ReportDelta, unit = "", positiveIsGood = true) {
  if (d.current === null || d.previous === null) return undefined;
  return { value: Math.round((d.current - d.previous) * 10) / 10, unit, positiveIsGood, label: "前月比" };
}

function rankText(r: number | null): string {
  return r === null ? "圏外" : `${r} 位`;
}

function RankChanges({ title, items }: { title: string; items: RankChange[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-[12px] font-bold text-ink">{title}</h4>
      <ul className="mt-1 space-y-0.5 text-[12px] text-muted">
        {items.map((c) => (
          <li key={c.keyword}>
            {c.keyword}: {rankText(c.from)} → <span className="font-bold text-ink">{rankText(c.to)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportsTool() {
  const params = useSearchParams();
  const initialMonth = params.get("month");
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [month, setMonth] = useState<string | null>(initialMonth);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [pdf, setPdf] = useState<"idle" | "working" | "failed">("idle");
  const [notifications, setNotifications] = useState<NotificationsResponse | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (m: string | null) => {
    try {
      const body = await fetchReport(m);
      setData(body);
      setMonth(body.month);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込めませんでした");
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    const body = await fetchNotifications();
    if (body) setNotifications(body);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchReport(initialMonth)
      .then((body) => {
        if (!alive) return;
        setData(body);
        setMonth(body.month);
        setError(null);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "読み込めませんでした");
      });
    fetchNotifications().then((body) => {
      if (alive && body) setNotifications(body);
    });
    return () => {
      alive = false;
    };
  }, [initialMonth]);

  async function generate(m: string) {
    setGenerating(m);
    setError(null);
    try {
      const res = await fetch("/api/reports/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month: m }) });
      if (!res.ok) throw new Error(await readError(res));
      await load(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作れませんでした");
    } finally {
      setGenerating(null);
    }
  }

  async function onPdf() {
    const element = reportRef.current;
    if (!element || !data?.report) return;
    setPdf("working");
    try {
      await downloadPdf({ element, fileName: `monthly-report-${data.report.month}.pdf` });
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }

  async function markRead() {
    await fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
    await loadNotifications();
  }

  const report = data?.report ?? null;
  const months = data ? [...new Set([...data.months, ...data.generatable])].sort().reverse() : [];

  return (
    <div className="space-y-6">
      <Card
        title="月次レポート"
        description={data ? `毎月 1 日 5:00 に前月分を作ります（次回 ${formatDateTime(data.nextRunAt)}）。設定で ON にしていればメールでも届きます。` : "読み込んでいます…"}
        actions={
          <>
            <Select aria-label="月" value={month ?? ""} onChange={(e) => void load(e.target.value)} className="h-9 w-36 text-[13px]" disabled={months.length === 0}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {data?.months.includes(m) ? "" : "（未作成）"}
                </option>
              ))}
            </Select>
            {data?.generatable.map((m) => (
              <Button key={m} size="sm" variant="secondary" onClick={() => void generate(m)} loading={generating === m} disabled={generating !== null || !data.enabled}>
                {m === data.generatable[0] ? "前月分を作る" : "今月分（途中まで）を作る"}
              </Button>
            ))}
            <Button size="sm" onClick={() => void onPdf()} loading={pdf === "working"} disabled={!report}>
              PDF でダウンロード
            </Button>
          </>
        }
      >
        {error && (
          <Callout tone="fail" className="mb-4">
            {error}
          </Callout>
        )}
        {pdf === "failed" && <p className="mb-2 text-[13px] text-fail">PDF を作成できませんでした</p>}
        {data && !data.enabled && <Callout tone="info">月次レポートの保存先（Supabase）が未設定のため、いまは作れません。</Callout>}
        {data?.enabled && !report && !error && (
          <EmptyState title={`${month ? monthLabel(month) : "この月"}のレポートはまだありません`} description="「前月分を作る」を押すと、保存済みの数字からいま作ります。毎月 1 日には自動で作られます。" />
        )}
        {report && (
          <div ref={reportRef} className="space-y-6">
            <section>
              <h3 className="text-base font-bold text-ink">
                {monthLabel(report.month)}の要点{report.siteDomain && <span className="ml-2 text-[12px] font-normal text-muted">{report.siteDomain}</span>}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink">
                {report.summary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">作成 {formatDateTime(report.generatedAt)}。前月比は「前月の最後の値」との差です。</p>
            </section>

            {report.actions.length > 0 && (
              <section className="rounded-sm border border-line bg-surface p-4">
                <h3 className="text-[14px] font-bold text-ink">来月やること（優先順）</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink">
                  {report.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ol>
              </section>
            )}

            {report.rank && (
              <section>
                <h3 className="text-[14px] font-bold text-ink">検索順位（SEO）</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <StatCard label="計測した語" value={report.rank.measured} unit="語" />
                  <StatCard label="10 位以内" value={report.rank.top10.current ?? "—"} unit="語" delta={deltaOf(report.rank.top10, " 語")} />
                  <StatCard label="平均順位" value={report.rank.avgRank.current ?? "—"} unit="位" delta={deltaOf(report.rank.avgRank, " 位", false)} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <RankChanges title="上がった語" items={report.rank.up} />
                  <RankChanges title="下がった語" items={report.rank.down} />
                </div>
              </section>
            )}

            {report.meo &&
              report.meo.map((s) => (
                <section key={s.name}>
                  <h3 className="text-[14px] font-bold text-ink">Google マップ（MEO）: {s.name}</h3>
                  <div className="mt-2 grid gap-3 md:grid-cols-4">
                    <StatCard label="マップ診断" value={s.score.current ?? "—"} unit="点" delta={deltaOf(s.score, " 点")} />
                    <StatCard label="評価" value={s.rating.current ?? "—"} delta={deltaOf(s.rating)} />
                    <StatCard label="口コミ" value={s.reviews.current ?? "—"} unit="件" delta={deltaOf(s.reviews, " 件")} />
                    <StatCard label="写真" value={s.photos.current ?? "—"} unit="枚" delta={deltaOf(s.photos, " 枚")} />
                  </div>
                  {s.rank.length > 0 && <div className="mt-3"><RankChanges title="マップ検索の順位（対策キーワード）" items={s.rank} /></div>}
                </section>
              ))}

            {report.ai && (
              <section>
                <h3 className="text-[14px] font-bold text-ink">AI 検索モニタリング</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <StatCard label="観測（自社）" value={report.ai.observations} unit="回" />
                  <StatCard label="参照される割合" value={report.ai.mentionRate.current ?? "—"} unit="%" delta={deltaOf(report.ai.mentionRate, "%")} />
                  <StatCard label="引用される割合" value={report.ai.citeRate.current ?? "—"} unit="%" delta={deltaOf(report.ai.citeRate, "%")} />
                </div>
              </section>
            )}

            {report.seo && (
              <section>
                <h3 className="text-[14px] font-bold text-ink">精密診断{report.seo.runAt ? `（${formatDateTime(report.seo.runAt)}${report.seo.source === "auto" ? "・自動" : ""}）` : "（当月の診断なし）"}</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-4">
                  <StatCard label="トップページの採点" value={report.seo.quick.current ?? "—"} unit="点" delta={deltaOf(report.seo.quick, " 点")} />
                  <StatCard label="重大な課題" value={report.seo.errors.current ?? "—"} unit="件" delta={deltaOf(report.seo.errors, " 件", false)} />
                  <StatCard label="警告" value={report.seo.warnings.current ?? "—"} unit="件" delta={deltaOf(report.seo.warnings, " 件", false)} />
                  <StatCard label="直った / 悪化" value={report.seo.improved === null ? "—" : `${report.seo.improved} / ${report.seo.worsened}`} />
                </div>
              </section>
            )}

            {report.listings && (
              <section>
                <h3 className="text-[14px] font-bold text-ink">掲載（サイテーション）</h3>
                <ul className="mt-2 space-y-1 text-[13px] text-ink">
                  {report.listings.map((s) => (
                    <li key={s.name}>
                      {s.name}: 掲載済み {s.live} / {s.total} 媒体（申請中 {s.submitted}・未登録 {s.todo}）
                      {s.missing > 0 && <span className="ml-1 text-fail">消えた掲載 {s.missing}</span>}
                      {s.mismatch > 0 && <span className="ml-1 text-warn">表記のずれ {s.mismatch}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.reviews && (
              <section>
                <h3 className="text-[14px] font-bold text-ink">口コミ支援（アンケート QR）</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-4">
                  <StatCard label="回答" value={report.reviews.responses.current ?? 0} unit="件" delta={deltaOf(report.reviews.responses, " 件")} />
                  <StatCard label="平均評価" value={report.reviews.averageRating.current ?? "—"} delta={deltaOf(report.reviews.averageRating)} />
                  <StatCard label="低評価" value={report.reviews.low} unit="件" />
                  <StatCard label="投稿ボタン" value={report.reviews.clicks} unit="回" />
                </div>
              </section>
            )}

            <section>
              <h3 className="text-[14px] font-bold text-ink">今月の動き</h3>
              <div className="mt-2 grid gap-3 md:grid-cols-4">
                <StatCard label="Google への投稿" value={report.activity.posts} unit="件" hint={`予約中 ${report.activity.scheduled} 件`} />
                <StatCard label="変化の知らせ" value={report.activity.alerts} unit="件" />
                <StatCard label="自動の順位計測" value={report.activity.autoRankRuns} unit="回" />
                <StatCard label="サイトの事故" value={report.monitor ? report.monitor.incidents : "—"} unit={report.monitor ? "件" : ""} hint={report.monitor ? `重大 ${report.monitor.critical}` : "監視の記録なし"} />
              </div>
            </section>
          </div>
        )}
      </Card>

      <Card
        title="お知らせ"
        description="順位の急落・サイトの事故・掲載の消失・低評価の回答・投稿の結果・自動再診断・月次レポート。設定でメールでも受け取れます。"
        actions={
          notifications && notifications.unread > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => void markRead()}>
              すべて既読にする（{notifications.unread}）
            </Button>
          ) : null
        }
      >
        {notifications && !notifications.enabled && <Callout tone="info">お知らせの保存先（Supabase）が未設定です。</Callout>}
        {notifications && notifications.enabled && notifications.items.length === 0 && <EmptyState title="お知らせはまだありません" description="定期処理が動いて変化があると、ここに残ります。" />}
        {notifications && notifications.items.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {notifications.items.map((n) => (
              <li key={n.id} className={`py-2.5 ${n.readAt ? "" : "bg-accent-soft px-2"}`}>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <Badge tone="neutral" icon={false}>
                    {NOTIFICATION_KIND_LABELS[n.kind]}
                  </Badge>
                  <span className="tabular-nums">{formatDateTime(n.createdAt)}</span>
                  {n.emailedAt && <span>メール送信済み</span>}
                  {n.link && (
                    <a href={n.link} className="text-accent underline-offset-2 hover:underline">
                      開く
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-[13px] font-bold text-ink">{n.title}</p>
                <p className="mt-0.5 whitespace-pre-line text-[12px] text-muted">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
