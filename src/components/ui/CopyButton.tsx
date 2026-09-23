"use client";

import { useState } from "react";
import { Button, type ButtonVariant } from "./Button";

export interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  /** 「コピーしました」を出しておく時間（ミリ秒） */
  resetMs?: number;
}

/** テキストをクリップボードにコピーするボタン（コピー後しばらく（既定 2 秒）だけ表示を変える） */
export function CopyButton({ text, label = "コピー", variant = "secondary", resetMs = 2_000 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), resetMs);
        } catch {
          // クリップボードが使えない環境（権限拒否・非 https）では何もしない
        }
      }}
    >
      {copied ? "コピーしました" : label}
    </Button>
  );
}
