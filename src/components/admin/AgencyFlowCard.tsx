"use client";

/**
 * マスター画面「管理アカウント」の案内カード。
 *
 * 追加したあと、**その方が何をすればいいか**を最後（ブックマーク）まで 1 枚で見せる。
 * 運用者が口頭で説明しなくて済むよう、そのまま渡せる案内文も置く。
 *
 * 道のりは 2 本（src/lib/admin/onboarding.ts）。上のカードで追加すると、その結果の道のりに
 * 自動で切り替わる（「招待メールを送りました」= invited / 「管理アカウントにしました」= promoted）。
 * 文言と URL はすべて onboarding.ts 側。ここは並べるだけにして、両方がずれないようにする。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import {
  agencyClosedDoors,
  agencyEntryPoints,
  agencyFlowSteps,
  agencyGuideMessage,
  type AgencyEntry,
} from "@/lib/admin/onboarding";

export interface AgencyFlowCardProps {
  /** 直前に追加した結果。道のりの切り替えと、案内文の招待リンクに使う */
  added?: { kind: AgencyEntry; email: string; url?: string | null } | null;
}

const TABS: { entry: AgencyEntry; label: string; note: string }[] = [
  { entry: "invited", label: "まだ登録していない方", note: "招待メールが飛びます" },
  { entry: "promoted", label: "すでに登録済みの方", note: "メールは飛びません" },
];

export function AgencyFlowCard({ added = null }: AgencyFlowCardProps) {
  // 追加した直後は、その結果の道のりを開いた状態で始める（運用者が選び直さなくていいように）。
  // 追加のたびに親が key を変えてこのカードを作り直すので、効果（useEffect）での同期は要らない。
  const [entry, setEntry] = useState<AgencyEntry>(added?.kind ?? "invited");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const steps = agencyFlowSteps(entry);
  // 案内文の宛先は、追加した直後ならそのアドレス。まだ何も追加していないときは書き方の見本を出す
  const sample = added && added.kind === entry;
  const message = agencyGuideMessage({
    entry,
    email: sample ? added.email : "（追加したメールアドレス）",
    inviteUrl: sample ? added.url : null,
  });

  async function copy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      // クリップボードが使えない環境（権限・古いブラウザ）では、本文を選んで手でコピーしてもらう
      setCopyError("コピーできませんでした。下の本文を選択してコピーしてください。");
    }
  }

  return (
    <Card
      title="追加したあと、その方がすること"
      description="メールが届いてから、ログインして毎日どこを開くかまでの流れです。上でメールアドレスを追加すると、その結果に合った道のりに切り替わります。"
    >
      <div className="space-y-6">
        {/* 道のりの切り替え */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="どちらの道のりを見るか">
          {TABS.map((tab) => {
            const on = tab.entry === entry;
            return (
              <button
                key={tab.entry}
                type="button"
                aria-pressed={on}
                onClick={() => setEntry(tab.entry)}
                className={`rounded-sm border px-3 py-2 text-left text-[12px] leading-tight ${
                  on ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                <span className="block font-bold">{tab.label}</span>
                <span className="block text-[11px]">{tab.note}</span>
              </button>
            );
          })}
        </div>

        {added && (
          <Callout tone="info" title={`いま追加した ${added.email} は、この道のりです`}>
            {added.kind === "invited"
              ? "招待メールを送りました。ご本人が登録を済ませてログインすると、上の一覧に並びます。"
              : "すでに登録済みのアカウントに権限を付けました。招待メールは送っていません（届かないのが正しい動きです）。"}
          </Callout>
        )}

        {/* 手順 */}
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.n} className="rounded-sm border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-brand text-[11px] font-bold text-on-brand tabular-nums">
                  {step.n}
                </span>
                <span
                  className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${
                    step.actor === "運用者" ? "bg-panel text-muted" : "bg-info-soft text-info"
                  }`}
                >
                  {step.actor}
                </span>
                <span className="text-[13px] font-bold text-ink">{step.title}</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{step.detail}</p>
              {step.url && (
                <p className="mt-1">
                  <a
                    href={step.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-mono text-[11px] text-accent underline"
                  >
                    {step.url}
                  </a>
                </p>
              )}
              {step.pitfall && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-warn">注意: {step.pitfall}</p>
              )}
            </li>
          ))}
        </ol>

        {/* ログイン後の入口 */}
        <div>
          <h3 className="text-[13px] font-bold text-ink">ログインしたあと、今後どこから開くか</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-y border-line text-left text-[11px] text-muted">
                  <th className="py-1.5 pr-3 font-bold">したいこと</th>
                  <th className="py-1.5 pr-3 font-bold">開く場所</th>
                  <th className="py-1.5 font-bold">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agencyEntryPoints().map((row) => (
                  <tr key={row.purpose} className="text-ink">
                    <td className="py-1.5 pr-3 font-bold leading-relaxed">{row.purpose}</td>
                    <td className="py-1.5 pr-3 leading-relaxed text-muted">{row.where}</td>
                    <td className="py-1.5 leading-relaxed">
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-mono text-[11px] text-accent underline"
                        >
                          {row.url}
                        </a>
                      ) : (
                        <span className="text-muted">画面の中から</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 開かない画面 */}
        <div>
          <h3 className="text-[13px] font-bold text-ink">管理アカウントでは開かない画面</h3>
          <ul className="mt-2 space-y-1.5">
            {agencyClosedDoors().map((door) => (
              <li key={door.label} className="text-[12px] leading-relaxed text-muted">
                <span className="font-bold text-ink">{door.label}</span>
                <span className="mx-1">…</span>
                {door.result}
              </li>
            ))}
          </ul>
        </div>

        {/* そのまま渡せる案内文 */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold text-ink">ご本人にお渡しする案内文</h3>
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? "コピーしました" : "案内文をコピー"}
            </Button>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            メールや LINE にそのまま貼れます。
            {added?.kind === "invited" && added.url
              ? "いま追加した方の招待リンク入りです（ご本人にだけお渡しください）。"
              : "追加した直後にこの画面を開くと、宛先と招待リンクが入った文面になります。"}
          </p>
          {copyError && (
            <Callout tone="fail" title="エラー" className="mt-2">
              {copyError}
            </Callout>
          )}
          <textarea
            readOnly
            value={message}
            rows={14}
            aria-label="ご本人にお渡しする案内文"
            className="mt-2 w-full rounded-sm border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink"
          />
        </div>
      </div>
    </Card>
  );
}
