"use client";

/**
 * ⑥ 結果。生成した llms.txt（または robots.txt）のプレビューとコピー・ダウンロード。
 */
import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Callout } from "@/components/ui";
import { renderLlmsTxt, renderRobotsBlock } from "@/lib/llms-txt/render";
import type { LlmsTxtState } from "@/lib/llms-txt/types";

/** テキストをファイルとしてダウンロードさせる（クライアント専用） */
function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Output({
  fileName,
  text,
  description,
}: {
  fileName: string;
  text: string;
  description: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境（権限拒否など）では手でコピーしてもらう
      setCopied(false);
    }
  }, [text]);

  return (
    <section className="rounded-sm border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <code className="font-mono">{fileName}</code>
            <Badge tone="neutral">{text.length.toLocaleString("ja-JP")} 文字</Badge>
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? "コピーしました" : "コピー"}
          </Button>
          <Button size="sm" onClick={() => downloadText(fileName, text)}>
            ダウンロード
          </Button>
        </div>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink">
        {text}
      </pre>
    </section>
  );
}

export function StepResult({ state }: { state: LlmsTxtState }) {
  const llmsTxt = useMemo(() => renderLlmsTxt(state), [state]);
  const robotsTxt = useMemo(() => (state.allowCrawl ? null : renderRobotsBlock()), [state.allowCrawl]);

  const enabled = state.pages.filter((p) => p.enabled && p.url.trim()).length;

  return (
    <div className="space-y-5">
      {enabled === 0 && (
        <Callout tone="warn" title="出力するページがありません">
          手順 ④ でページを追加すると、llms.txt に「## 主要コンテンツ」の一覧が入ります。
        </Callout>
      )}

      <Output
        fileName="llms.txt"
        text={llmsTxt}
        description="サイトのルート（https://example.co.jp/llms.txt）に置いてください。"
      />

      {robotsTxt && (
        <Output
          fileName="robots.txt（追記用）"
          text={robotsTxt}
          description="既存の robots.txt の末尾に貼り付けてください。必要な用途のブロックだけを残せます。"
        />
      )}

      <div className="rounded-sm border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink">
        <p className="font-bold">設置のしかた</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>上のファイルをダウンロードし、サイトのルート直下（公開ディレクトリの一番上）に置きます。</li>
          <li>
            ブラウザで <code className="font-mono">https://（あなたのドメイン）/llms.txt</code> を開き、
            テキストとして表示されることを確認します（HTML の 404 ページが出る場合は置き場所が違います）。
          </li>
          <li>ページを増やしたら、このウィザードで作り直して差し替えてください。入力内容はブラウザに保存されています。</li>
        </ol>
      </div>
    </div>
  );
}
