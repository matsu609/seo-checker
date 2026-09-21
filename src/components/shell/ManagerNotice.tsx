"use client";

/**
 * 管理アカウントがお客様向けの画面（ツール・設定・料金プラン）を開いたときの案内。
 *
 * 管理アカウントはサービスの利用者ではなく、お客様の対応をする立場なので、
 * これらの画面は使わない（利用者の指示 2026-09-21「紛らわしいので見れないように」）。
 * URL を直接開いた・古いブックマークから来た場合にここへ着く。
 *
 * お客様の画面そのものを確かめたいときは、顧客管理の「この方の画面を見る」（代理ログイン）を使う。
 */
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

export function ManagerNotice() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Callout tone="info" title="この画面は管理アカウントでは使いません">
        <p className="leading-relaxed">
          ツール・設定・料金プランは、ご契約いただいたお客様がお使いになる画面です。管理アカウントでは、
          お客様の契約状況・ご利用状況の確認と、ご意見への返答・割引・機能の開放を「顧客管理」で行います。
        </p>
        <p className="mt-2 leading-relaxed">
          お客様の画面の見え方を確かめたいときは、顧客管理でそのお客様の
          <span className="font-bold">「この方の画面を見る」</span>をお使いください。
        </p>
        <p className="mt-3">
          <Link href="/clients" className={buttonClass("primary", "sm")}>
            顧客管理へ
          </Link>
        </p>
      </Callout>
    </div>
  );
}
