"use client";

/**
 * 無料診断のヘッダー右側（ログイン状態で出し分ける）。
 *
 * Clerk のキーがあるときだけ FreeShell が描画する。ClerkProvider が無い状態で
 * useAuth() を呼ぶと例外になるため、フックはこの部品に閉じ込める（AuthMenu と同じ考え方）。
 */
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { SIGN_UP_PATH } from "@/lib/free/upsell";

export function FreeHeaderActions() {
  const { isLoaded, isSignedIn } = useAuth();

  // 読み込み中は高さだけ確保して、ヘッダーの中身が動かないようにする
  if (!isLoaded) return <span className="h-9 w-40" aria-hidden />;

  // ログイン済みの人に申し込みを勧めない。管理画面（/start が契約状況で振り分ける）へ戻す
  if (isSignedIn) {
    return (
      <Link href="/start" className={buttonClass("secondary", "sm")}>
        管理画面へ
      </Link>
    );
  }

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
