"use client";

/**
 * トップバー右端のログイン状態。
 *
 * Clerk のキーがあるときだけ AppShell が描画する。ClerkProvider が
 * 無い状態で useAuth() を呼ぶと例外になるため、フックはこの部品に閉じ込め、
 * 呼ぶかどうかは「この部品を描画するかどうか」で決める。
 */
import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";

export function AuthMenu() {
  const { isLoaded, isSignedIn } = useAuth();

  // 読み込み中は高さだけ確保して、トップバーの中身が動かないようにする
  if (!isLoaded) return <span className="h-7 w-7" aria-hidden />;

  if (!isSignedIn) {
    return (
      <Link
        href="/sign-in"
        className="rounded-sm px-2 py-1 text-[13px] font-bold text-accent underline outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        ログイン
      </Link>
    );
  }
  return <UserButton />;
}
