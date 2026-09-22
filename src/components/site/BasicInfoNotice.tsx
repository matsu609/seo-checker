"use client";

/**
 * 「基本情報は設定から取り込み済み」の帯（利用者の指示 2026-09-22
 * 「NAP チェックと掲載は基本情報が設定に登録されているので、また入力するのは二度手間」）。
 *
 * 設定（/settings の「会社・店舗の基本情報」とホームページ）を**正**とし、
 * ツール側は**読むだけ**にする。r118 で AI 検索モニタリングに入れた
 * 「同期は 設定 → ツール の一方向。直すなら設定」と同じ決めごとをそろえた。
 *
 * ただし NAP の突き合わせは「この表記が正しい」と決めた値で走らせたいことがあるので、
 * **この回だけの上書き**は畳んだ中に残す（既定では開かない = 入力を求めない）。
 */
import type { ReactNode } from "react";
import { Badge, Button, ButtonLink, Callout, Card, Field, Input } from "@/components/ui";
import { SITE_SETTINGS_HREF } from "./RegisteredSite";

/** 設定の「会社・店舗の基本情報」カードへの直リンク */
export const BUSINESS_SETTINGS_HREF = "/settings#business";

export interface BasicInfo {
  name: string;
  phone: string;
  address: string;
  website: string;
}

export interface BasicInfoNoticeProps {
  value: BasicInfo;
  /** 上書きされたか（設定のままなら false） */
  overridden: boolean;
  onChange: (next: BasicInfo) => void;
  /** 設定に戻す */
  onReset: () => void;
  /** 実行ボタン */
  action: ReactNode;
  /** 店名が無いと走らせられない、など */
  requires?: readonly (keyof BasicInfo)[];
  /** MEO の登録店舗から取り込む（複数店舗のとき）。無ければ出さない */
  storePicker?: ReactNode;
  className?: string;
}

const LABELS: Record<keyof BasicInfo, string> = {
  name: "店名・屋号",
  phone: "電話番号",
  address: "住所",
  website: "サイト",
};

const ORDER: (keyof BasicInfo)[] = ["name", "phone", "address", "website"];

/** 足りない必須項目を返す（画面と、呼び出し側の実行可否で同じ判定を使う） */
export function missingFields(value: BasicInfo, requires: readonly (keyof BasicInfo)[] = ["name"]): (keyof BasicInfo)[] {
  return requires.filter((k) => !value[k].trim());
}

export function BasicInfoNotice({
  value,
  overridden,
  onChange,
  onReset,
  action,
  requires = ["name"],
  storePicker,
  className = "",
}: BasicInfoNoticeProps) {
  const missing = missingFields(value, requires);

  return (
    <Card
      title="調べる基本情報"
      description="設定に登録した会社・店舗の基本情報とホームページをそのまま使います。ここで入力し直す必要はありません。"
      className={className}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={overridden ? "warn" : "pass"} icon={false}>
            {overridden ? "この回だけ上書き中" : "設定から取り込み済み"}
          </Badge>
          <ButtonLink href={BUSINESS_SETTINGS_HREF} size="sm" variant="ghost">
            設定で直す
          </ButtonLink>
        </div>
      }
    >
      {missing.length > 0 && (
        <Callout tone="warn" className="mb-3" title={`${missing.map((k) => LABELS[k]).join("・")}が設定に登録されていません`}>
          <p className="leading-relaxed">先に設定へ登録してください。ここで入れた値は保存されず、次に開くとまた消えてしまいます。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={BUSINESS_SETTINGS_HREF} size="sm">
              設定で基本情報を登録する
            </ButtonLink>
            {missing.includes("website") && (
              <ButtonLink href={SITE_SETTINGS_HREF} size="sm" variant="secondary">
                設定でホームページを登録する
              </ButtonLink>
            )}
          </div>
        </Callout>
      )}

      <dl className="grid gap-x-6 gap-y-2 @xl:grid-cols-2">
        {ORDER.map((key) => (
          <div key={key} className="flex min-w-0 items-baseline gap-2 border-b border-line py-1.5 last:border-0 @xl:last:border-b">
            <dt className="w-24 shrink-0 text-[11px] text-muted">{LABELS[key]}</dt>
            <dd className={`min-w-0 flex-1 truncate text-[13px] ${value[key].trim() ? "text-ink" : "text-muted"}`}>
              {value[key].trim() || "未登録"}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {action}
        {storePicker}
      </div>

      {/* 上書きは畳んでおく。既定では「入力してください」の顔をさせない */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] text-muted">この回だけ別の値で調べる</summary>
        <div className="mt-3 grid gap-3 @xl:grid-cols-2">
          {ORDER.map((key) => (
            <Field key={key} label={LABELS[key]}>
              <Input value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          ここで変えても<strong className="font-bold">設定には保存されません</strong>（この回の調査にだけ使います）。恒久的に直すなら設定で変えてください。
        </p>
        {overridden && (
          <Button size="sm" variant="secondary" className="mt-2" onClick={onReset}>
            設定の値に戻す
          </Button>
        )}
      </details>
    </Card>
  );
}
