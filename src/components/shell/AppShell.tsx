"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { findFeatureByPath } from "@/lib/features/registry";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  children: ReactNode;
  /** package.json の version（layout.tsx から渡す） */
  version: string;
  /** Clerk のキーが設定されているか（layout.tsx がサーバー側で判定して渡す） */
  authEnabled: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 全ページ共通のシェル。md 以上は左に固定サイドバー（15rem）、md 未満はドロワー。
 * スクロールは body。印刷 / PDF ではサイドバー・トップバー・ドロワーが消え（no-print）、
 * グリッドは globals.css の .app-shell ルールで通常フローに戻る。
 *
 * <main> について: 無料診断（/）の Checker は自分の <main class="max-w-3xl"> を持ち、
 * それを PDF 化の対象にしている。二重の <main> と余白の二重化を避けるため、
 * / ではシェルは素の <div> で包み、ツールページだけシェルの <main> に入れる。
 */
export function AppShell({ children, version, authEnabled }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const feature = findFeatureByPath(pathname);
  // 無料診断（/ と /meo）は画面側が <main> を持つので、シェルは素の <div> で包む
  const isFree = feature?.group === "free";
  const drawerId = useId();

  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // ページ遷移（戻る / 進むを含む）で閉じる。
  // effect ではなく描画中に前回の pathname と比べて state を直す（React 推奨の派生 state パターン）
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    if (open) setOpen(false);
  }

  // 開いている間: Escape で閉じる・body のスクロールを止める・フォーカスをドロワーへ
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        menuButtonRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // Tab でドロワーの外に出ない
  function trapFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !drawerRef.current) return;
    const nodes = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="app-shell min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* デスクトップのサイドバー */}
      <aside className="no-print hidden w-60 flex-col overflow-y-auto bg-brand text-on-brand md:sticky md:top-0 md:flex md:h-screen">
        <Sidebar pathname={pathname} version={version} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col print:block print:min-h-0">
        <TopBar
          ref={menuButtonRef}
          feature={feature}
          menuOpen={open}
          onOpenMenu={() => setOpen(true)}
          drawerId={drawerId}
          authEnabled={authEnabled}
        />
        {isFree ? (
          <div className="flex-1">{children}</div>
        ) : (
          <main className="flex-1 px-4 py-6 md:px-8 print:m-0 print:max-w-none print:p-0">{children}</main>
        )}
      </div>

      {/* モバイルのドロワー */}
      {open && (
        <>
          <div className="no-print fixed inset-0 z-30 bg-ink/50 md:hidden" onClick={close} aria-hidden />
          <div
            id={drawerId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
            onKeyDown={trapFocus}
            className="no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-brand text-on-brand md:hidden"
          >
            <Sidebar ref={closeButtonRef} pathname={pathname} version={version} onNavigate={close} onClose={close} />
          </div>
        </>
      )}
    </div>
  );
}
