"use client";

/**
 * 代理ログイン中であることを常に出す帯。
 *
 * 代理中は、画面の中身がそのお客様のものになる（サイドバーの「マスター画面」も消える。
 * 判定がお客様のアカウントで行われるため）。**戻る手段がここにしか無い**ので、
 * 画面の下に固定して、どのページでも必ず見えるようにしておく。
 *
 * 「うっかり操作してしまった」を防ぐのは、この帯の見た目と、決済 API 側の塞ぎ
 * （src/lib/admin/impersonate.ts の isImpersonating）の 2 段構え。
 *
 * ClerkProvider が無い環境（開発・E2E）では描画しない。AppShell が authEnabled で出し分ける。
 */
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";

export function ImpersonationBanner() {
  const { actor, sessionId } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [leaving, setLeaving] = useState(false);

  // actor が入っているときだけが代理ログイン中
  if (!actor?.sub) return null;

  const who = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "お客様";

  async function leave() {
    setLeaving(true);
    try {
      // そのセッションだけを閉じる。Clerk が複数セッションを持てる設定なら
      // 運用者自身のセッションに戻り、そうでなければログイン画面に出る
      await signOut({ sessionId: sessionId ?? undefined, redirectUrl: "/admin" });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div
      role="status"
      className="no-print fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-warn bg-warn-soft px-4 py-2.5 text-[13px] text-warn"
    >
      <span className="font-bold">代理ログイン中</span>
      <span className="min-w-0 truncate text-ink">
        <span className="font-bold">{who}</span> さんの画面を見ています
      </span>
      <span className="text-[12px]">
        お支払いの操作はできません。30 分で自動的に切れます。
      </span>
      <button
        type="button"
        onClick={() => void leave()}
        disabled={leaving}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-warn bg-panel px-3 font-bold text-warn outline-none hover:bg-warn-soft focus-visible:ring-2 focus-visible:ring-warn/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {leaving ? "終了しています…" : "終了して自分に戻る"}
      </button>
    </div>
  );
}
