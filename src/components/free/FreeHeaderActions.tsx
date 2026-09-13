"use client";

/**
 * クイック診断のヘッダー右側（ログイン状態で出し分ける）。
 *
 * Clerk のキーがあるときだけ FreeShell が描画する。ClerkProvider が無い状態で
 * useAuth() を呼ぶと例外になるため、フックはこの部品に閉じ込める（AuthMenu と同じ考え方）。
 *
 * ログイン済みの人にはクイック診断を見せず、管理画面（/start）へ戻す（利用者の決定 2026-09-13）。
 * 料金を払っている人に無料の診断が見えていると、支払っている意味が薄れて見えるため。
 * 見込み客に渡した URL は、未ログインの相手にはそのまま開く。
 */
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui/Button";
import { SIGN_UP_PATH } from "@/lib/free/upsell";

export function FreeHeaderActions() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // /start が契約状況で振り分ける（未契約なら料金プラン、契約済みならツール）
    if (isLoaded && isSignedIn) router.replace("/start");
  }, [isLoaded, isSignedIn, router]);

  // 読み込み中とログイン済み（遷移中）は高さだけ確保して、ヘッダーの中身が動かないようにする
  if (!isLoaded || isSignedIn) return <span className="h-9 w-40" aria-hidden />;

  return (
    <>
      <Link
        href="/sign-in"
        className="rounded-sm px-2 py-1 text-[13px] font-bold text-accent underline outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        ログイン
      </Link>
      <Link href={SIGN_UP_PATH} className={buttonClass("primary", "sm")}>
        初月無料ではじめる
      </Link>
    </>
  );
}
