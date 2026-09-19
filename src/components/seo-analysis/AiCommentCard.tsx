"use client";

/**
 * カードごとの短い講評（利用者の指示: 個々の結果ごとに読み解きを見られるように）。
 * 渡された facts だけを AI に読ませ、要約・ポイント・次にやることを出す。
 */
import { useMemo, useState } from "react";
import { Badge, Button, Callout, Card } from "@/components/ui";
import type { Comment } from "@/lib/seo-analysis/ai/schema";
import type { Fact } from "@/lib/seo-analysis/sheet/types";
import { FactChips } from "./FactsAppendix";
import { requestComment } from "./client";

export function AiCommentCard({
  title,
  facts,
  aiEnabled,
  description,
}: {
  /** 何の分析か（例: 「サイトの構成と信頼の手がかり」） */
  title: string;
  facts: Fact[];
  /** ANTHROPIC_API_KEY があるか（未取得なら null） */
  aiEnabled: boolean | null;
  description?: string;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; result: { comment: Comment; model: string } | null }>({
    loading: false,
    error: null,
    result: null,
  });
  const factMap = useMemo(() => new Map(facts.map((f) => [f.id, f] as [string, Fact])), [facts]);

  async function run() {
    setState({ loading: true, error: null, result: null });
    try {
      const out = await requestComment(title, facts);
      if (!out) {
        setState({ loading: false, error: "ANTHROPIC_API_KEY が未設定のため講評は作れません", result: null });
        return;
      }
      setState({ loading: false, error: null, result: out });
    } catch (err) {
      setState({ loading: false, error: err instanceof Error ? err.message : "講評を作れませんでした", result: null });
    }
  }

  return (
    <Card
      title={`AI の分析: ${title}`}
      description={description ?? "この画面の数字だけを AI（Claude）に読ませ、言えること・次にやることを書かせます。主張には数字の ID が付きます。"}
      actions={
        aiEnabled ? (
          <Button variant="secondary" size="sm" loading={state.loading} onClick={() => void run()}>
            {state.result ? "もう一度分析する" : "AI に分析させる"}
          </Button>
        ) : null
      }
    >
      {aiEnabled === false && (
        <p className="text-[13px] text-muted">
          講評には <code className="font-mono">ANTHROPIC_API_KEY</code> の設定が必要です。
        </p>
      )}
      {state.error && (
        <Callout tone="warn" className="mb-3">
          {state.error}
        </Callout>
      )}
      {state.result && (
        <div className="space-y-4 text-[13px] leading-relaxed">
          <p className="text-sm text-ink">{state.result.comment.summary}</p>
          <div>
            <h3 className="mb-1.5 text-sm font-bold text-ink">言えること</h3>
            <ul className="space-y-1.5">
              {state.result.comment.points.map((p, i) => (
                <li key={i} className="border-l-2 border-line pl-3 text-ink">
                  {p.text} <FactChips ids={p.factIds} facts={factMap} className="ml-1 align-middle" />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-bold text-ink">次にやること</h3>
            <ol className="list-decimal space-y-1.5 pl-5">
              {state.result.comment.actions.map((a, i) => (
                <li key={i} className="text-ink">
                  {a.text} <FactChips ids={a.factIds} facts={factMap} className="ml-1 align-middle" />
                </li>
              ))}
            </ol>
          </div>
          {state.result.comment.cautions.length > 0 && (
            <p className="text-[12px] text-muted">断定できない点: {state.result.comment.cautions.join(" ／ ")}</p>
          )}
          <p className="text-[11px] text-muted">
            <Badge tone="info" icon={false}>
              AI 生成
            </Badge>{" "}
            {state.result.model}。数字の ID はこの画面の値を指します。
          </p>
        </div>
      )}
      {!state.result && !state.error && aiEnabled && (
        <p className="text-[13px] text-muted">ボタンを押すと、この画面の {facts.length} 行の数字から AI が要約と次の一手を書きます（回数制限の対象外）。</p>
      )}
    </Card>
  );
}
