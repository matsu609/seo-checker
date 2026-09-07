"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** テキストをクリップボードにコピーするボタン（コピー後 2 秒だけ表示を変える） */
export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        } catch {
          // クリップボードが使えない環境（権限拒否・非 https）では何もしない
        }
      }}
    >
      {copied ? "コピーしました" : label}
    </Button>
  );
}
