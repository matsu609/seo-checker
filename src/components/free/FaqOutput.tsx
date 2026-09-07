"use client";

/**
 * 承認済み FAQ から JSON-LD と HTML を作って見せる（生成ロジックは lib/faq/render.ts のまま）。
 * レポートのセクション内に置くため、自前の <section> は持たない。
 */
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
      className="no-print inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] font-bold text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "コピーしました" : label}
    </button>
  );
}

function CodeBlock({ title, code, note }: { title: string; code: string; note: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-bold text-ink">{title}</h4>
          <p className="text-[11px] leading-relaxed text-muted">{note}</p>
        </div>
        <CopyButton text={code} label="コピー" />
      </div>
      <pre className="mt-2 max-h-80 overflow-auto rounded-sm border border-line bg-surface p-3 text-[11px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function FaqOutput({ faqs }: { faqs: FaqItem[] }) {
  const jsonLd = buildFaqScriptTag(faqs);
  const html = buildFaqHtml(faqs);

  return (
    <div>
      <ul className="space-y-2">
        {faqs.map((f, i) => (
          <li key={i} className="rounded-sm border border-line p-3">
            <p className="text-[14px] font-bold text-ink">Q. {f.question}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">A. {f.answer}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-5">
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
    </div>
  );
}
