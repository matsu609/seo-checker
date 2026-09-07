"use client";

/**
 * 取得条件（期間・比較単位・指標・キーイベント名）のフォーム。
 *
 * 比較単位と指標は取得済みの日次データを画面側で集計し直すだけなので、
 * 切り替えても GA4 は叩かない（そのことを注記に書く）。
 */
import { useId, useState } from "react";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import type { AiTrafficSettings } from "@/lib/ai-traffic/store";
import {
  GRANULARITY_LABELS,
  MAX_KEY_EVENT_NAMES,
  METRIC_LABELS,
  isValidEventName,
  type Granularity,
  type TrafficMetric,
} from "@/lib/ai-traffic/types";
import { PERIOD_PRESETS, formatRange, type DateRange } from "@/lib/ga4/period";

export interface TrafficControlsProps {
  settings: AiTrafficSettings;
  onChange: (next: AiTrafficSettings) => void;
  /** 解決済みの期間（カスタム期間が不正なら null） */
  range: DateRange | null;
  rangeError: string | null;
  ga4Enabled: boolean;
  running: boolean;
  /** 取得済みの結果があるか（「再取得」を出すかどうか） */
  hasResult: boolean;
  onRun: (refresh: boolean) => void;
  onCancel: () => void;
}

/** 選択肢の帯（ラジオ相当）。1px 枠 + 選択中は accent-soft */
function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-panel p-1">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`h-8 rounded-sm px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              selected ? "bg-accent-soft font-bold text-accent" : "text-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const CUSTOM = "custom";
const GRANULARITIES: readonly Granularity[] = ["day", "week", "month"];
const METRICS: readonly TrafficMetric[] = ["sessions", "users"];

export function TrafficControls({
  settings,
  onChange,
  range,
  rangeError,
  ga4Enabled,
  running,
  hasResult,
  onRun,
  onCancel,
}: TrafficControlsProps) {
  const id = useId();
  const [eventName, setEventName] = useState("");
  const [eventError, setEventError] = useState<string | null>(null);

  const periodValue = settings.days > 0 ? String(settings.days) : CUSTOM;
  const periodOptions = [
    ...PERIOD_PRESETS.map((p) => ({ value: String(p.days), label: p.label })),
    { value: CUSTOM, label: "カスタム" },
  ];

  function addEventName() {
    const name = eventName.trim();
    if (!name) {
      setEventError("キーイベント名を入力してください");
      return;
    }
    if (!isValidEventName(name)) {
      setEventError("GA4 のイベント名（英数字とアンダースコア、40 文字以内）で入力してください");
      return;
    }
    if (settings.keyEventNames.includes(name)) {
      setEventError("すでに追加されています");
      return;
    }
    if (settings.keyEventNames.length >= MAX_KEY_EVENT_NAMES) {
      setEventError(`キーイベント名は最大 ${MAX_KEY_EVENT_NAMES} 件までです`);
      return;
    }
    onChange({ ...settings, keyEventNames: [...settings.keyEventNames, name] });
    setEventName("");
    setEventError(null);
  }

  return (
    <Card
      title="取得する条件"
      description="GA4 の runReport を 2 本（日次の参照元別・ランディングページ別）呼びます。比較単位と指標の切り替えは取得済みのデータを集計し直すだけで、GA4 は再取得しません。"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] font-bold text-ink">期間</span>
          <SegmentedControl
            label="期間"
            value={periodValue}
            options={periodOptions}
            disabled={running}
            onChange={(next) =>
              onChange({ ...settings, days: next === CUSTOM ? 0 : Number(next) })
            }
          />
          {range && <span className="text-[12px] text-muted tabular-nums">{formatRange(range)}</span>}
        </div>

        {settings.days === 0 && (
          <div className="grid gap-3 @2xl:grid-cols-[12rem_12rem]">
            <Field label="開始日" htmlFor={`${id}-start`} hint="YYYY-MM-DD">
              <Input
                id={`${id}-start`}
                type="date"
                value={settings.startDate}
                disabled={running}
                onChange={(e) => onChange({ ...settings, startDate: e.target.value })}
              />
            </Field>
            <Field label="終了日" htmlFor={`${id}-end`} hint="GA4 は当日分が確定しません">
              <Input
                id={`${id}-end`}
                type="date"
                value={settings.endDate}
                disabled={running}
                onChange={(e) => onChange({ ...settings, endDate: e.target.value })}
              />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] font-bold text-ink">比較単位</span>
          <SegmentedControl
            label="比較単位"
            value={settings.granularity}
            options={GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABELS[g] }))}
            onChange={(granularity) => onChange({ ...settings, granularity })}
          />
          <span className="text-[13px] font-bold text-ink">指標</span>
          <SegmentedControl
            label="指標"
            value={settings.metric}
            options={METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
            onChange={(metric) => onChange({ ...settings, metric })}
          />
        </div>

        <div className="rounded-sm border border-line p-3">
          <Field
            label="キーイベント名（任意）"
            htmlFor={`${id}-event`}
            hint={`ページ表に列として出すイベント名。最大 ${MAX_KEY_EVENT_NAMES} 件。未指定でもキーイベントの合計は表示されます。`}
            error={eventError ?? undefined}
          >
            <div className="flex flex-wrap gap-2">
              <Input
                id={`${id}-event`}
                value={eventName}
                placeholder="例: contact_form_submit"
                disabled={running}
                className="max-w-xs"
                onChange={(e) => {
                  setEventName(e.target.value);
                  setEventError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addEventName();
                }}
              />
              <Button variant="secondary" disabled={running} onClick={addEventName}>
                追加
              </Button>
            </div>
          </Field>
          {settings.keyEventNames.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {settings.keyEventNames.map((name) => (
                <li key={name} className="inline-flex items-center gap-1">
                  <Badge tone="id">{name}</Badge>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() =>
                      onChange({ ...settings, keyEventNames: settings.keyEventNames.filter((n) => n !== name) })
                    }
                    className="rounded-sm text-[11px] text-muted outline-none hover:text-fail focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
                    aria-label={`${name} を外す`}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rangeError && (
          <p className="text-[12px] text-fail" role="alert">
            {rangeError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            loading={running}
            disabled={!ga4Enabled || !range}
            onClick={() => onRun(false)}
            title={!ga4Enabled ? "GA4_PROPERTY_ID と GOOGLE_SERVICE_ACCOUNT_JSON が未設定のため取得できません" : undefined}
          >
            集計する
          </Button>
          {hasResult && (
            <Button variant="secondary" size="lg" disabled={!ga4Enabled || !range || running} onClick={() => onRun(true)}>
              再取得
            </Button>
          )}
          {running && (
            <Button variant="secondary" size="lg" onClick={onCancel}>
              中止
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
