"use client";

import { useState } from "react";
import { buildFaqHtml, buildFaqScriptTag } from "@/lib/faq/render";
import type { FaqItem } from "@/lib/faq/schema";
import { Copy } from "./Icons";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない（テキストは選択してコピーできる）
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="no-print inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium hover:bg-surface"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "コピーしました" : label}
    </button>
  );
}

function CodeBlock({ title, code, note }: { title: string; code: string; note: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">{title}</h4>
          <p className="text-xs text-muted">{note}</p>
        </div>
        <CopyButton text={code} label="コピー" />
      </div>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function FaqOutput({ faqs }: { faqs: FaqItem[] }) {
  const jsonLd = buildFaqScriptTag(faqs);
  const html = buildFaqHtml(faqs);

  return (
    <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
      <h2 className="text-xl font-bold">生成結果</h2>
      <p className="mt-1 text-sm text-muted">
        承認した {faqs.length} 件から FAQPage 構造化データと HTML を生成しました。
      </p>

      <h3 className="mt-6 text-lg font-bold">プレビュー</h3>
      <div className="mt-3 space-y-3">
        {faqs.map((f, i) => (
          <div key={i} className="rounded-xl border border-line p-4">
            <div className="font-bold">Q. {f.question}</div>
            <div className="mt-2 leading-relaxed text-muted">A. {f.answer}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-6">
        <CodeBlock
          title="① 構造化データ（JSON-LD）"
          note="<head> 内、または </body> の直前に貼り付けてください。"
          code={jsonLd}
        />
        <CodeBlock
          title="② FAQ の HTML"
          note="ページ本文の FAQ を置きたい位置に貼り付けてください。構造化データの内容と一致させる必要があります。"
          code={html}
        />
      </div>
    </section>
  );
}
