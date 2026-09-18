"use client";

/**
 * 診断フォーム（no-print）。レポートのシートとは独立したブロックとして上に置く。
 * 範囲切替は segmented な 2 ボタン（role="radio"）。
 */
import type { FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { FREE_SUITE_LABEL } from "@/lib/features/registry";
import { freeSiteMaxPages } from "@/lib/free/limits";
import { FreeTargetSwitch } from "./FreeTargetSwitch";
import { ServiceGuideButton } from "./ServiceGuideButton";

export type Mode = "page" | "site";

/** このツールの公式サイト */
const SITE_URL = "https://seo-checker.tokyo/";

const OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "page", label: "このページ", hint: "入力した URL 1 ページだけを診断します" },
  {
    value: "site",
    // クイック診断のサイト全体は代表ページだけ（全ページの採点は精密診断の役目）
    label: "サイト全体（代表ページ）",
    hint: `sitemap と内部リンクから代表の ${freeSiteMaxPages()} ページを収集して診断します`,
  },
];

export function DiagnosisForm({
  url,
  onUrlChange,
  mode,
  onModeChange,
  onSubmit,
  busy,
  error,
  disabled = false,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  error?: string | null;
  /** 無料診断の回数を使い切ったとき（送信を止める） */
  disabled?: boolean;
}) {
  return (
    <section className="no-print mb-6 rounded-sm border border-line bg-panel p-5">
      <h1 className="text-[20px] font-bold text-ink">{FREE_SUITE_LABEL}</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        URL を入力すると、検索エンジンと AI 検索（AIO）に読まれる土台をルールベースで採点し、報告書として出力します。登録したメールアドレスごとに 2 回まで無料です。
      </p>
      <FreeTargetSwitch current="site" />

      <form onSubmit={onSubmit} className="mt-4" noValidate>
        <Field label="診断する URL" htmlFor="url" error={error}>
          <Input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com/"
            value={url}
            invalid={Boolean(error)}
            onChange={(e) => onUrlChange(e.target.value)}
          />
        </Field>

        <div role="radiogroup" aria-label="診断の範囲" className="mt-3 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onModeChange(opt.value)}
                className={`rounded-md border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-ink hover:bg-surface"
                }`}
              >
                <span className="block text-[13px] font-bold">{opt.label}</span>
                <span className={`mt-0.5 block text-[11px] leading-relaxed ${selected ? "text-accent" : "text-muted"}`}>
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>

        <Button type="submit" size="lg" loading={busy} disabled={disabled} className="mt-3 w-full">
          {disabled ? "無料診断の回数を使い切りました" : "診断する"}
        </Button>
      </form>

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        クイック診断は公開されている情報だけを、ルールベース（生成 AI 不使用）で採点します。想定 FAQ の生成だけ AI を使います。
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[12px] leading-relaxed text-muted">
          クイック診断でわかることや、精密診断（有料プラン）で使えるツールの一覧をまとめた資料をご用意しています。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ServiceGuideButton />
          {/* 公式サイト。別タブで開く（診断の入力内容を失わせない） */}
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-accent underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            サービスの詳細は公式サイトへ
            <span aria-hidden="true"> ↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
