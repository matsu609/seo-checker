"use client";

/**
 * HP 改修提案。URL を入れてボタン一つで、機械的な診断と AI の改修案を出す。
 *
 * 想定の使い方:
 *   - お客様はこの画面を見るだけ（読み取り専用の内容）
 *   - 運用者はボタンを押し、出てきた提案をそのまま読み上げて説明する
 * そのため提案は「そのまま貼れる after」を必ず持ち、根拠（なぜ）と
 * 期待できることを 1 枚に並べる。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, InlineDiff } from "@/components/ui";
import { AREA_LABELS, EFFORT_LABELS, PRIORITY_LABELS, type Proposal } from "@/lib/improvement/schema";
import type { ImprovementResult } from "@/lib/improvement/generate";
import type { BadgeTone } from "@/components/ui/Badge";

const PRIORITY_TONE: Record<Proposal["priority"], BadgeTone> = {
  high: "fail",
  medium: "warn",
  low: "info",
};

export function ImprovementView() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(refresh = false) {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/improvement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), keyword: keyword.trim() || undefined, refresh }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `生成できませんでした（HTTP ${res.status}）`);
      setResult(body.result as ImprovementResult);
      setCached(Boolean(body.cached));
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成できませんでした");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="対象ページ"
        description="URL を入れてボタンを押すだけです。ページを診断し、そのまま使える改修案を AI が作ります。1 回につき 1 ページを対象にします。"
        className="no-print"
      >
        <div className="grid gap-3 @md:grid-cols-[1fr_16rem]">
          <Field label="ページの URL" htmlFor="improve-url">
            <Input
              id="improve-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/service"
              inputMode="url"
              disabled={loading}
            />
          </Field>
          <Field label="対策キーワード（任意）" htmlFor="improve-kw" hint="入れると提案がその語に寄ります">
            <Input
              id="improve-kw"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="港区 税理士"
              disabled={loading}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => void run()} loading={loading} disabled={url.trim().length === 0}>
            改修案を作る
          </Button>
          {result && (
            <Button variant="ghost" onClick={() => void run(true)} disabled={loading}>
              作り直す
            </Button>
          )}
          {cached && !loading && (
            <span className="text-[12px] text-muted">前回の結果を表示しています（作り直すと再生成します）</span>
          )}
        </div>
      </Card>

      {error && (
        <Callout tone="fail" title="生成できませんでした" className="no-print">
          {error}
        </Callout>
      )}

      {!result && !loading && !error && (
        <EmptyState
          title="まだ改修案はありません"
          description="URL を入れて「改修案を作る」を押すと、診断結果をもとに具体的な改修案を作ります。"
        />
      )}

      {result && <Plan result={result} />}
    </div>
  );
}

function Plan({ result }: { result: ImprovementResult }) {
  const { plan, report } = result;
  return (
    <>
      <Card title="総評" printCard>
        <p className="text-[12px] text-muted">
          <span className="break-all">{result.finalUrl}</span> ／ 現在のスコア {report.score} 点（{report.scoreLabel}）
        </p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
          {plan.summary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card
        title="改修案"
        description={`${plan.proposals.length} 件。優先度の高いものから並んでいます。「変更後」はそのままコピーして使えます。`}
        printCard
      >
        <ol className="space-y-5">
          {plan.proposals.map((p, i) => (
            <li key={i}>
              <ProposalCard proposal={p} index={i + 1} />
            </li>
          ))}
        </ol>
      </Card>

      <p className="text-[11px] leading-relaxed text-muted">
        この改修案は AI が生成したものです。掲載順位や成果を保証するものではありません。
        数値や固有名詞は、公開前に必ず事実と合っているかご確認ください。
      </p>
    </>
  );
}

function ProposalCard({ proposal, index }: { proposal: Proposal; index: number }) {
  const [copied, setCopied] = useState(false);
  const isAddition = proposal.before.trim().length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(proposal.after);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境（権限なし等）では黙って何もしない
    }
  }

  return (
    <div className="rounded-sm border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="text-[13px] font-bold text-muted tabular-nums">{index}.</span>
        <h3 className="min-w-0 flex-1 text-[15px] font-bold text-ink">{proposal.headline}</h3>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Badge icon={false}>{AREA_LABELS[proposal.area]}</Badge>
          <Badge tone={PRIORITY_TONE[proposal.priority]} icon={false}>
            優先度 {PRIORITY_LABELS[proposal.priority]}
          </Badge>
          <Badge icon={false}>手間 {EFFORT_LABELS[proposal.effort]}</Badge>
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink">{proposal.why}</p>

      <div className="mt-3 grid gap-3 @lg:grid-cols-2">
        <div>
          <p className="text-[12px] font-bold text-muted">現在</p>
          <div className="mt-1 max-h-60 overflow-y-auto rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
            {isAddition ? <span className="text-muted">（このページには未設定です）</span> : proposal.before}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-muted">変更後</p>
            <Button variant="ghost" size="sm" onClick={() => void copy()} className="no-print">
              {copied ? "コピーしました" : "コピー"}
            </Button>
          </div>
          <div className="mt-1 max-h-60 overflow-y-auto rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
            {proposal.after}
          </div>
        </div>
      </div>

      {!isAddition && (
        <details className="mt-3 no-print">
          <summary className="cursor-pointer text-[13px] text-accent">変更箇所を色分けして見る</summary>
          <InlineDiff before={proposal.before} after={proposal.after} className="mt-2" maxHeightClass="max-h-72" />
        </details>
      )}

      <p className="mt-3 text-[13px] text-muted">
        <span className="font-bold">期待できること:</span> {proposal.impact}
      </p>
    </div>
  );
}
