"use client";

/**
 * 画面に出ている報告書を PDF で保存するボタンの状態（作成中 / 失敗）。
 *
 * 2026-09-23 まで、クイック診断（free/Checker）・クイック MEO 診断（free/MeoChecker）・
 * マップ診断（maps/MapsTool）に同じ実装があった。
 */
import { useCallback, useState, type RefObject } from "react";
import { downloadPdf } from "@/lib/pdf/download";

export type PdfDownloadState = "idle" | "working" | "failed";

/** `ref` の要素を PDF にする。`reset` は別の報告書に切り替えたときに失敗表示を消す用 */
export function usePdfDownload(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<PdfDownloadState>("idle");

  const download = useCallback(
    async (fileName: string) => {
      const element = ref.current;
      if (!element) return;
      setState("working");
      try {
        await downloadPdf({ element, fileName });
        setState("idle");
      } catch {
        setState("failed");
      }
    },
    [ref],
  );

  const reset = useCallback(() => setState("idle"), []);

  return { state, download, reset };
}
