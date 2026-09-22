"use client";

/**
 * ダッシュボードの部品（利用者の指示 2026-09-22。他社の画面を見て「こういう UI がいい」）。
 *
 * 入れたのは 4 つ:
 *   ScheduleBanner    … 次回 / 最終実行。「自分の数字はいつ新しくなるのか」を最初に見せる
 *   FilterBar         … モデル / タグ / 期間。画面を作り替えずに切り口を変える
 *   RecentOutputsCard … **実際の LLM 出力**。数字だけより「本当に測っている」が伝わる
 *   DomainsCard       … どのサイトに引用されているか
 *
 * どれも**新しい計測はしない**（すでに保存してあるものを見せるだけ）ので費用は増えない。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, Field, StatCard } from "@/components/ui";
import { palette } from "@/lib/ui/palette";
import {
  AIO_APPEARANCE_LABELS,
  AIO_OUTCOME_LABELS,
  PERIOD_OPTIONS,
  type DomainCitation,
  type KeywordOutcomeSummary,
  type ObservationFilter,
} from "@/lib/geo/aggregate";
import { relativeLabel } from "@/lib/geo/schedule";
import { DOMAIN_CLASS_LABELS, GEO_MODEL_LABELS, GEO_MODELS, type GeoModel } from "@/lib/geo/types";
import { pct } from "@/lib/report/format";
import type { RecentOutputView } from "./client";

/* ───────────── 自動実行スケジュール ───────────── */

export function ScheduleBanner({ schedule, now = new Date() }: { schedule: { nextRunAt: string; lastRunAt: string | null; enabled: boolean }; now?: Date }) {
  const next = new Date(schedule.nextRunAt);
  const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <Badge tone={schedule.enabled ? "pass" : "neutral"} icon={false}>
          {schedule.enabled ? "有効" : "停止中"}
        </Badge>
        <span className="text-[13px] font-bold text-ink">自動実行スケジュール</span>
        <span className="text-[11px] text-muted">毎日 5:00 に自動で計測します</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
        <span className="text-muted">
          次回実行予定{" "}
          <strong className="font-bold tabular-nums text-ink">{relativeLabel(now, next)}後</strong>
          <span className="ml-1 tabular-nums">（{next.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</span>
        </span>
        <span className="text-muted">
          最終実行{" "}
          {last ? (
            <>
              <strong className="font-bold tabular-nums text-ink">{relativeLabel(now, last)}前</strong>
              <span className="ml-1 tabular-nums">（{last.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}）</span>
            </>
          ) : (
            <strong className="font-bold text-ink">まだありません</strong>
          )}
        </span>
      </div>
    </div>
  );
}

/* ───────────── フィルタ行 ───────────── */

export interface FilterBarProps {
  value: ObservationFilter;
  tags: readonly string[];
  /** 観測があるモデルだけを選択肢にする（測っていないモデルを並べない） */
  models: readonly GeoModel[];
  onChange: (next: ObservationFilter) => void;
  busy?: boolean;
}

export function FilterBar({ value, tags, models, onChange, busy = false }: FilterBarProps) {
  const cls = "rounded-sm border border-line bg-panel px-3 py-2 text-[13px] text-ink disabled:opacity-60";
  const modelOptions = models.length > 0 ? models : GEO_MODELS;
  const dirty = (value.model && value.model !== "all") || (value.tag && value.tag !== "all") || (value.days ?? 28) !== 28;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="モデル">
        <select className={cls} disabled={busy} value={value.model ?? "all"} onChange={(e) => onChange({ ...value, model: e.target.value as GeoModel | "all" })}>
          <option value="all">すべてのモデル</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {GEO_MODEL_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="タグ">
        <select className={cls} disabled={busy || tags.length === 0} value={value.tag ?? "all"} onChange={(e) => onChange({ ...value, tag: e.target.value })}>
          <option value="all">すべてのタグ</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="期間">
        <select className={cls} disabled={busy} value={value.days ?? 28} onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}>
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      {dirty && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange({ model: "all", tag: "all", days: 28 })}>
          条件を戻す
        </Button>
      )}
      {(value.days ?? 28) !== 28 && (
        <p className="w-full text-[11px] text-muted">
          見出しの数字は 4 週間ぶんをまとめた値が既定です。期間を短くすると観測が減り、帯が広がって読み取れる差が小さくなります。
        </p>
      )}
    </div>
  );
}

/* ───────────── 最近の生成結果 ───────────── */

/** 本文の先頭だけを見せる長さ（開くと全文） */
const PREVIEW_CHARS = 120;

export function RecentOutputsCard({ items, now = new Date() }: { items: readonly RecentOutputView[]; now?: Date }) {
  return (
    <Card title="最近の生成結果" description="自社が言及されたかどうかと、実際に返ってきた AI の回答です。数字の裏づけとして 1 件ずつ確かめられます。">
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">まだ計測結果がありません。定期計測が 1 回動くと、ここに実際の回答が並びます。</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <RecentOutputRow key={item.measurementId} item={item} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentOutputRow({ item, now }: { item: RecentOutputView; now: Date }) {
  const [open, setOpen] = useState(false);
  const long = item.responseText.length > PREVIEW_CHARS;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={item.mentioned ? "pass" : "neutral"} icon={false}>
          {item.mentioned ? "言及あり" : "言及なし"}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{item.text}</span>
        <span className="text-[11px] text-muted">{GEO_MODEL_LABELS[item.model] ?? item.model}</span>
        <span className="text-[11px] tabular-nums text-muted">約 {relativeLabel(now, new Date(item.executedAt))}前</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
        {open || !long ? item.responseText : `${item.responseText.slice(0, PREVIEW_CHARS)}…`}
      </p>
      {long && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpen((v) => !v)}>
          {open ? "たたむ" : "全文を見る"}
        </Button>
      )}
    </li>
  );
}

/* ───────────── ドメイン別の引用 ───────────── */

const CLASS_TONE = { own: "pass", competitor: "warn", third_party: "neutral" } as const;

export function DomainsCard({ domains }: { domains: readonly DomainCitation[] }) {
  const max = Math.max(0.01, ...domains.map((d) => d.share));
  return (
    <Card
      title="ドメイン別の引用状況"
      description="登録したプロンプト・キーワードの計測で、AI が出典として挙げたサイトです。ここに出る媒体に載ると引用されやすくなります。"
    >
      {domains.length === 0 ? (
        <p className="text-[13px] text-muted">まだ引用データがありません。定期計測が動くとここに並びます。</p>
      ) : (
        <ul className="space-y-2">
          {domains.map((d) => (
            <li key={d.domain} className="grid items-center gap-x-3 gap-y-1 @lg:grid-cols-[1fr_5rem_3.5rem]">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{d.domain}</span>
                {d.domainClass && (
                  <Badge tone={CLASS_TONE[d.domainClass]} icon={false}>
                    {DOMAIN_CLASS_LABELS[d.domainClass]}
                  </Badge>
                )}
              </div>
              <div className="h-2 rounded-sm bg-surface" aria-hidden="true">
                <div className="h-2 rounded-sm" style={{ width: `${(d.share / max) * 100}%`, background: palette.chart[0] }} />
              </div>
              <div className="text-right text-[12px] tabular-nums text-muted">
                <span className="font-bold text-ink">{pct(d.share)}</span>
                <span className="ml-1">{d.count} 回</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ───────────── 見出し（名前 → 一言） ───────────── */

/**
 * 機能に**名前と一言**を与える見出し（利用者の指示 2026-09-22
 * 「こういった機能のまとめ方はわかりやすい」）。
 * 説明的な見出しがカードごとにバラバラに並んでいたのを、4 つの「分析」にくくり直す。
 */
export function SectionHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="pt-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <h3 className="mt-0.5 text-[17px] font-bold text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>
    </div>
  );
}

/* ───────────── AI Overviews 分析（キーワードごとの成果） ───────────── */

const APPEARANCE_TONE = { present: "pass", absent: "neutral", unmeasured: "neutral" } as const;
const OUTCOME_TONE = { cited: "pass", none: "warn", unmeasured: "neutral" } as const;

export function KeywordOutcomesCard({ summary }: { summary: KeywordOutcomeSummary }) {
  return (
    <Card
      title="キーワードごとの AI 出現と引用"
      description="1 語ずつに「Google での順位」「AI の回答が出たか」「そこで自社が引用されたか」を並べています。並びは打ち手になる順（出ているのに引用されていないものが上）です。"
      printCard
    >
      <div className="grid gap-3 @2xl:grid-cols-3">
        <StatCard label="AI の回答が出た語" value={summary.appearedCount} unit="語" hint="登録キーワードのうち" />
        <StatCard label="自社が引用された語" value={summary.citedCount} unit="語" hint="出た語のうち" />
        <StatCard
          label="自社引用率"
          value={summary.citedRate === null ? "—" : pct(summary.citedRate)}
          hint={summary.citedRate === null ? "AI の回答が出た語がまだありません" : `${summary.citedCount} / ${summary.appearedCount} 語`}
        />
      </div>

      {summary.opportunities.length > 0 && (
        <Callout tone="warn" className="mt-4" title={`引用を取りに行ける語が ${summary.opportunities.length} 件`}>
          <p className="leading-relaxed">
            AI の回答は出ているのに自社が参照されていない語です。ここに出る媒体に載る・その語の内容を厚くするのが次の一手になります。
          </p>
        </Callout>
      )}

      {summary.rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">
          設定の「対策キーワード」を登録すると、週 1 回（月曜）の計測からこの表が埋まります。
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="py-1 pr-3 font-normal">キーワード</th>
                <th className="py-1 pr-3 text-right font-normal">Google 順位</th>
                <th className="py-1 pr-3 font-normal">AI の回答</th>
                <th className="py-1 font-normal">自社の引用</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.keywordId} className="border-b border-line">
                  <td className="max-w-[16rem] truncate py-2 pr-3 text-ink">{row.keyword}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">
                    {row.seoRank !== null ? row.seoRank : row.rankMeasured ? <span className="text-muted">圏外</span> : <span className="text-muted">未計測</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={APPEARANCE_TONE[row.appearance]} icon={false}>
                      {AIO_APPEARANCE_LABELS[row.appearance]}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <Badge tone={OUTCOME_TONE[row.outcome]} icon={false}>
                      {AIO_OUTCOME_LABELS[row.outcome]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        「非出現」はその語で AI の回答そのものが出なかったこと、「未計測」はまだ測っていないことです。
        <strong className="font-bold">この 2 つを混ぜません</strong>（未計測を「出ていない」と読むと判断を誤るため）。
      </p>
    </Card>
  );
}
