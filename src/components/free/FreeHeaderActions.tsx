"use client";

/**
 * 無料診断のヘッダー右側。
 *
 * 2026-10-02 から無料診断は専用リンク（`/free/<トークン>`。Clerk とは別）を開いた人だけが使う（利用者の決定）。
 * 出すのは「料金プランを見る」（デモの相手に申し込みを案内する導線）と「診断を終える」（Cookie を消す。
 * 共有の PC で開いたままにしないため）だけ。Clerk のフックは使わない。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { PLANS_PATH } from "@/lib/free/upsell";

export function FreeHeaderActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/free/logout", { method: "POST" });
    } catch {
      // 消せなくても Cookie は 30 日で切れる
    }
    // `/` はリクエストごとにサーバーが Cookie を見て振り分ける（Cookie が無いのでログイン画面に着く）
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <Link href={PLANS_PATH} className={buttonClass("primary", "sm")}>
        料金プランを見る
      </Link>
      <button type="button" onClick={logout} disabled={busy} className={buttonClass("secondary", "sm")}>
        診断を終える
      </button>
    </>
  );
}
