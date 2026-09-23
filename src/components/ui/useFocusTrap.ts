"use client";

/**
 * モーダル / ドロワーを開いている間の共通の振る舞い。
 *
 * - Escape で `onClose`
 * - body のスクロールを止める（閉じたら元に戻す）
 * - 開いたときに最初に触る要素へフォーカス（`initialFocus`: ref か、コンテナ内のセレクタ）
 * - 戻り値のハンドラを `onKeyDown` に付けると、Tab / Shift+Tab でコンテナの外に出ない
 *
 * 閉じたあとにフォーカスをどこへ戻すかは呼び出し側で決める（開いたボタンなど）。
 * 2026-09-23 まで、ご意見フォーム（FeedbackDialog）とモバイルのドロワー（AppShell）に同じ実装があった。
 */
import { useEffect, type KeyboardEvent, type RefObject } from "react";

/** Tab で移動できる要素 */
export const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tab / Shift+Tab で端から外に出ようとしたら、反対の端を返す（出ないなら null） */
export function wrapFocusTarget<T>(nodes: readonly T[], active: unknown, shiftKey: boolean): T | null {
  if (nodes.length === 0) return null;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}

export interface FocusTrapOptions {
  /** 開いているか（開いている間だけ Escape・スクロール止め・初期フォーカスが効く） */
  active: boolean;
  onClose: () => void;
  /** 開いたときにフォーカスする要素（ref、またはコンテナ内の CSS セレクタ） */
  initialFocus: RefObject<HTMLElement | null> | string;
}

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, { active, onClose, initialFocus }: FocusTrapOptions) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof initialFocus === "string") containerRef.current?.querySelector<HTMLElement>(initialFocus)?.focus();
    else initialFocus.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active, onClose, initialFocus, containerRef]);

  // Tab でコンテナの外に出ない
  return function trapFocus(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Tab" || !containerRef.current) return;
    const nodes = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const target = wrapFocusTarget(nodes, document.activeElement, e.shiftKey);
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };
}
