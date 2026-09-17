"use client";

/**
 * Google での見られ方（ビジネス プロフィールのインサイト）。MEO 画面のカード。
 *
 * オーナー権限（business.manage）が要る。接続前は「接続すると表示」の枠と接続ボタンを出し、
 * 接続後は当月の 6 指標（前月比）・ユーザーアクション・月別の推移・流入キーワード（伸びた / 落ちた TOP3）。
 * 競合ツールの月次レポート（2026-09-17 に利用者が共有した PDF）と同じ並びにしてある。
 * データは /api/maps/performance が Google から取り、同じ月は 6 時間キャッシュ。
 */
import { useEffect, useState } from "react";
import type { MapsPerformanceResponse } from "@/app/api/maps/performance/route";
import { ConnectBusinessButton } from "@/components/replies/ConnectBusinessButton";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { PERFORMANCE_LABELS, type KeywordChange, type MonthRow, type PerformanceKey } from "@/lib/google/performance-types";

const CARD_KEYS: readonly PerformanceKey[] = ["impressions", "impressionsMaps", "impressionsSearch", "calls", "websiteClicks", "directions"];
const TABLE_KEYS: readonly PerformanceKey[] = ["impressions", "impressionsMaps", "impressionsSearch", "calls", "websiteClicks", "directions", "conversations", "bookings"];

function n(value: number): string {
  return value.toLocaleString("ja-JP");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

/** 前月比（差と %）。前月が 0 なら差だけ */
function delta(current: number, previous: number): { value: number; percent: number | null } {
  return { value: current - previous, percent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

function kwValue(k: KeywordChange, which: "current" | "previous"): string {
  const v = k[which];
  if (v === null) return "—";
  return `${k.approximate ? "～" : ""}${n(v)}`;
}

export interface PerformanceCardProps {
  number: number;
  placeId: string | null;
  storeName: string | null;
}

export function PerformanceCard({ number, placeId, storeName }: PerformanceCardProps) {
  const [month, setMonth] = useState<string>("");
  /** 最後に取れた結果。key（店舗 + 月）が今の要求と違えば「読み込み中」扱い（effect の中で同期的に setState しないため） */
  const [result, setResult] = useState<{ key: string; body: MapsPerformanceResponse | null; error: string | null } | null>(null);
  const key = `${placeId ?? ""}|${month}`;

  useEffect(() => {
    if (!placeId) return;
    const ac = new AbortController();
    const params = new URLSearchParams({ placeId });
    if (month) params.set("month", month);
    fetch(`/api/maps/performance?${params.toString()}`, { cache: "no-store", signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as MapsPerformanceResponse & { error?: string };
        if (!res.ok) throw new Error(body.error || `取得に失敗しました（HTTP ${res.status}）`);
        if (!ac.signal.aborted) setResult({ key, body, error: null });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setResult({ key, body: null, error: err instanceof Error ? err.message : "取得に失敗しました" });
      });
    return () => ac.abort();
  }, [placeId, month, key]);

  const current = result && result.key === key ? result : null;
  const data = current?.body ?? null;
  const error = current?.error ?? null;
  const loading = Boolean(placeId) && current === null;

  const summary = placeId ? (data?.summary ?? null) : null;

  return (
    <Card
      number={number}
      title="Google での見られ方（ビジネス プロフィールのインサイト）"
      description="表示回数・電話・ルート検索・流入キーワードは、店舗のオーナーか管理者の Google アカウントを接続したときだけ取れます（Google が公開していない数字です）。Google 側の集計は 2〜3 日遅れ、さかのぼれるのは 18 か月です。"
      className="no-print"
      actions={
        data && data.months.length > 0 ? (
          <Field label="対象月" className="min-w-[10rem]">
            <Select value={data.month} onChange={(e) => setMonth(e.target.value)} disabled={loading}>
              {data.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
        ) : undefined
      }
    >
      {!placeId && <EmptyState title="自社の店舗を登録してください" description="登録した店舗のインサイトをここに出します。" />}
      {placeId && loading && !data && <p className="text-[13px] text-muted">読み込んでいます…</p>}
      {placeId && error && (
        <Callout tone="fail" title="取得できませんでした">
          {error}
        </Callout>
      )}

      {placeId && data && !data.enabled && (
        <div className="space-y-3">
          {data.reason === "auth_disabled" && <Callout tone="info">ログイン（Clerk）が無い環境では Google ビジネス プロフィールを接続できません。</Callout>}
          {(data.reason === "not_connected" || data.reason === "no_scope") && (
            <>
              <Callout tone="info" title="Google と接続すると、ここに表示回数・電話・ルート検索・流入キーワードが入ります">
                <p className="leading-relaxed">
                  {storeName ? `「${storeName}」` : "この店舗"}のオーナーまたは管理者の Google アカウントで許可してください。Google の確認画面で<strong>ビジネス プロフィールの管理</strong>の許可を求めます。
                  取得した数字は、この画面に表示する以外の用途には使いません。
                </p>
              </Callout>
              <ConnectBusinessButton label={data.reason === "no_scope" ? "Google に口コミ返信・インサイトの権限を追加する" : "Google アカウントを接続する"} />
            </>
          )}
          {data.reason === "not_managed" && (
            <Callout tone="warn" title="接続した Google アカウントがこの店舗を管理していません">
              接続中: {data.email ?? "Google アカウント"}。この店舗のオーナーか管理者のアカウントで接続し直すか、ビジネス プロフィールの「ユーザーとアクセス」でこのアカウントを管理者に追加してください。
            </Callout>
          )}
          {data.error && (
            <Callout tone="warn" title="まだ数字を取得できません">
              {data.error}
            </Callout>
          )}
          <Placeholder />
        </div>
      )}

      {placeId && summary && (
        <div className="space-y-5">
          <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
            {CARD_KEYS.map((key) => {
              const d = delta(summary.current[key], summary.previous[key]);
              return <StatCard key={key} label={PERFORMANCE_LABELS[key]} value={n(summary.current[key])} delta={{ value: d.value, label: d.percent === null ? "前月比" : `（${d.percent > 0 ? "+" : ""}${d.percent}%）前月比` }} />;
            })}
          </div>
          <div className="grid gap-3 @md:grid-cols-2">
            <StatCard label="ユーザーアクション（電話 + サイト + ルート + メッセージ + 予約）" value={n(summary.actions.current)} delta={{ value: summary.actions.current - summary.actions.previous, label: "前月比" }} />
            <StatCard label="対象月" value={monthLabel(summary.month)} hint={data?.cached ? "6 時間以内に取得した数字です" : "Google から取得した数字です"} />
          </div>

          <MonthTable rows={summary.months} />

          <div>
            <h3 className="text-[13px] font-bold text-ink">流入キーワード（検索で表示されたときの語）</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              表示回数が少ない語は Google が「～15」のように丸めて返します（近似）。伸びた / 落ちたは、当月と前月の両方で正確な数がある語だけで見ています。
            </p>
            <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
              <TopList title="伸びたキーワード TOP3" items={summary.risers} tone="pass" />
              <TopList title="落ちたキーワード TOP3" items={summary.fallers} tone="warn" />
            </div>
            {summary.keywords.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">この月のキーワードはまだありません（Google の集計待ちか、表示回数が少なすぎます）。</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] text-muted">
                      <th className="px-2 py-1.5">キーワード</th>
                      <th className="px-2 py-1.5 text-right">当月</th>
                      <th className="px-2 py-1.5 text-right">前月</th>
                      <th className="px-2 py-1.5 text-right">増減</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.keywords.slice(0, 30).map((k) => (
                      <tr key={k.keyword} className="border-b border-line">
                        <td className="px-2 py-1.5 text-ink">{k.keyword}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{kwValue(k, "current")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{kwValue(k, "previous")}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{k.delta === null ? "—" : `${k.delta > 0 ? "+" : ""}${n(k.delta)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summary.keywords.length > 30 && <p className="mt-1 text-[11px] text-muted">上位 30 語を表示（全 {summary.keywords.length} 語）</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/** 接続前の枠（何が入るかを見せる） */
function Placeholder() {
  return (
    <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3" aria-hidden>
      {CARD_KEYS.map((key) => (
        <div key={key} className="rounded-sm border border-dashed border-line px-3 py-2">
          <p className="text-[11px] text-muted">{PERFORMANCE_LABELS[key]}</p>
          <p className="text-[18px] font-bold text-muted">—</p>
          <p className="text-[10px] text-muted">接続すると表示</p>
        </div>
      ))}
    </div>
  );
}

function MonthTable({ rows }: { rows: MonthRow[] }) {
  const shown = rows.slice(0, 12);
  return (
    <div>
      <h3 className="text-[13px] font-bold text-ink">月別の推移（直近 12 か月）</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted">
              <th className="px-2 py-1.5">月</th>
              {TABLE_KEYS.map((k) => (
                <th key={k} className="px-2 py-1.5 text-right">
                  {PERFORMANCE_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.month} className="border-b border-line">
                <td className="px-2 py-1.5 whitespace-nowrap text-ink">
                  {monthLabel(r.month)}
                  {!r.hasData && (
                    <Badge tone="neutral" icon={false} className="ml-1">
                      集計前
                    </Badge>
                  )}
                </td>
                {TABLE_KEYS.map((k) => (
                  <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                    {r.hasData ? n(r.totals[k]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopList({ title, items, tone }: { title: string; items: KeywordChange[]; tone: "pass" | "warn" }) {
  return (
    <div className="rounded-sm border border-line px-3 py-2">
      <p className="text-[12px] font-bold text-ink">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-[12px] text-muted">データがありません</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((k) => (
            <li key={k.keyword} className="flex items-center gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-ink">{k.keyword}</span>
              <Badge tone={tone} icon={false}>
                {(k.delta ?? 0) > 0 ? "+" : ""}
                {n(k.delta ?? 0)}
              </Badge>
              <span className="tabular-nums text-muted">
                {kwValue(k, "previous")} → {kwValue(k, "current")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
