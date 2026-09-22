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
import { Badge, Button, Card, Field } from "@/components/ui";
import { palette } from "@/lib/ui/palette";
import { PERIOD_OPTIONS, type DomainCitation, type ObservationFilter } from "@/lib/geo/aggregate";
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
