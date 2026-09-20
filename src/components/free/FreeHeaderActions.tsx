"use client";

/**
 * 無料診断のヘッダー右側（ログイン状態で出し分ける）。
 *
 * Clerk のキーがあるときだけ FreeShell が描画する。ClerkProvider が無い状態で
 * useAuth() を呼ぶと例外になるため、フックはこの部品に閉じ込める（AuthMenu と同じ考え方）。
 *
 * 2026-09-18 から無料診断は登録のあとに使うものになった（利用者の決定）。ログイン済みの人には
 * アカウントメニューと料金プランへの導線を出す。契約済みの人をツールへ戻すのは
 * 画面の入口（src/lib/free/gate.ts）が行う。未ログインの人は入口が登録フォームへ送るので、
 * ここに来るのは一瞬だけ（リンクだけ出しておく）。
 */
import { useAuth, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { PLANS_PATH, SIGN_UP_PATH } from "@/lib/free/upsell";
import { useAccess } from "@/lib/store/usePlan";

export function FreeHeaderActions() {
  const { isLoaded, isSignedIn } = useAuth();
  const access = useAccess();

  // 読み込み中は高さだけ確保して、ヘッダーの中身が動かないようにする
  if (!isLoaded) return <span className="h-9 w-40" aria-hidden />;

  if (isSignedIn) {
    // 運用者・代理店はデモ用に開いているので、料金プランではなく自分の画面へ戻す
    const back = access?.admin ? { href: "/admin", label: "マスター画面へ" } : access?.agency ? { href: "/clients", label: "顧客管理へ" } : null;
    return (
      <>
        {back ? (
          <Link href={back.href} className={buttonClass("secondary", "sm")}>
            {back.label}
          </Link>
        ) : (
          <Link href={PLANS_PATH} className={buttonClass("primary", "sm")}>
            料金プランを見る
          </Link>
        )}
        <UserButton />
      </>
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
        登録して無料診断
      </Link>
    </>
  );
}
