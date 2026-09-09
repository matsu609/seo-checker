"use client";

/**
 * サービス資料のダウンロードボタン。
 *
 * NEXT_PUBLIC_SERVICE_GUIDE_URL を設定すると、そのファイルへのリンクになる
 * （デザイン済みの資料をお持ちの場合はそちらを配る）。未設定のときは、
 * レポートと同じ仕組み（html2canvas + jsPDF）でこの場で PDF を作る。
 *
 * 資料の本体は押されるまで描画しない。常時 DOM に置くと、初期表示が重くなるうえ
 * 画面読み上げの邪魔になるため。
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { downloadPdf } from "@/lib/pdf/download";
import { ServiceGuide } from "./ServiceGuide";

/** 差し替え用の配布ファイル（自社で作った PDF を置く場合） */
const EXTERNAL_URL = process.env.NEXT_PUBLIC_SERVICE_GUIDE_URL;
const CONTACT_NAME = process.env.NEXT_PUBLIC_CONTACT_NAME;
const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL;

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface ServiceGuideButtonProps {
  /** 既定は secondary（診断ボタンより目立たせない） */
  variant?: "secondary" | "ghost";
  className?: string;
}

export function ServiceGuideButton({ variant = "secondary", className = "" }: ServiceGuideButtonProps) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  // 押されたときだけ資料を描画する
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const issuedOn = todayIso();

  if (EXTERNAL_URL) {
    return (
      <a
        href={EXTERNAL_URL}
        download
        className={`inline-flex h-11 items-center justify-center rounded-md border border-line bg-panel px-4 text-[14px] font-bold text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
      >
        サービス資料をダウンロード
      </a>
    );
  }

  async function download() {
    setState("working");
    setMounted(true);
    try {
      // 描画が終わってから画像化する（2 フレーム待つと初回でも取りこぼさない）
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const element = ref.current;
      if (!element) throw new Error("資料を組み立てられませんでした");
      await downloadPdf({ element, fileName: `service-guide_${issuedOn.replace(/-/g, "")}` });
      setState("idle");
    } catch {
      setState("failed");
    } finally {
      setMounted(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => void download()}
        loading={state === "working"}
        className={className}
      >
        サービス資料をダウンロード
      </Button>
      {state === "failed" && (
        <p role="alert" className="mt-1 text-[12px] text-fail">
          資料を作成できませんでした。時間をおいて再度お試しください。
        </p>
      )}
      {mounted && (
        // 画面外に置く。display:none にすると寸法が取れず画像化できない
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
          <div ref={ref}>
            <ServiceGuide contactName={CONTACT_NAME} contactUrl={CONTACT_URL} issuedOn={issuedOn} />
          </div>
        </div>
      )}
    </>
  );
}
