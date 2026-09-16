"use client";

/**
 * 「設定に登録したホームページ」を各ツールで使うための部品。
 *
 * 利用者の指示（2026-09-16）: ホームページの URL は設定（/settings）で 1 回だけ登録し、
 * ほかのタブでは URL の入力を求めない。競合の URL だけは入力欄を残す。
 *
 * 各ツールはここの useRegisteredSite() で対象サイトを受け取り、
 * SiteTargetNotice（対象の表示・未登録の導線）を画面の先頭に置く。
 * ページ単位のツールは PageTargetField でページだけを指定させる（省略時はトップページ）。
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Callout } from "@/components/ui/Callout";
import { Field, Input } from "@/components/ui/Field";
import { displayUrl, resolvePageUrl, toSiteUrl } from "@/lib/site/target";
import { useCurrentProject } from "@/lib/store/hooks";

/** 設定画面のホームページ登録カードへの直リンク */
export const SITE_SETTINGS_HREF = "/settings#home-url";

export interface RegisteredSite {
  /** 設定でホームページの URL が登録されているか */
  registered: boolean;
  /** トップページの URL（例: "https://example.co.jp/"）。未登録なら "" */
  siteUrl: string;
  /** ホスト名（例: "example.co.jp"）。未登録なら "" */
  domain: string;
  /** 画面に出す名前。未登録なら "" */
  name: string;
}

/** 設定に登録されたホームページ。未登録でも例外にせず registered: false を返す */
export function useRegisteredSite(): RegisteredSite {
  const { project } = useCurrentProject();
  const siteUrl = toSiteUrl(project?.startUrl || project?.domain || "");
  if (!siteUrl) return { registered: false, siteUrl: "", domain: "", name: "" };
  const domain = new URL(siteUrl).host;
  return { registered: true, siteUrl, domain, name: project?.name?.trim() || domain };
}

export interface SiteTargetNoticeProps {
  /** 「〜はこのサイトを対象にします」の主語。例: "サイト診断" */
  what: string;
  className?: string;
  /** 対象の右に足す補足（ページ指定の説明など） */
  children?: ReactNode;
}

/**
 * 対象サイトの表示。未登録のときだけ設定への導線を出す。
 * ここを置いた画面では URL の入力欄を持たない。
 */
export function SiteTargetNotice({ what, className = "", children }: SiteTargetNoticeProps) {
  const site = useRegisteredSite();

  if (!site.registered) {
    return (
      <Callout tone="warn" title="ホームページの URL が未登録です" className={className}>
        <p>
          設定でホームページの URL を 1 回登録すると、{what}はそのサイトを対象に動きます。
          ここで URL を打ち直す必要はありません。
        </p>
        <p className="mt-2">
          <Link href={SITE_SETTINGS_HREF} className="font-bold underline underline-offset-2">
            設定 → ホームページ を開く
          </Link>
        </p>
      </Callout>
    );
  }

  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-sm border border-line bg-surface px-4 py-3 ${className}`}>
      <span className="text-[12px] font-bold text-muted">対象のホームページ</span>
      <a
        href={site.siteUrl}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all text-sm font-bold text-ink underline underline-offset-2"
      >
        {displayUrl(site.siteUrl)}
      </a>
      <Link href={SITE_SETTINGS_HREF} className="text-[12px] text-muted underline underline-offset-2">
        設定で変更
      </Link>
      {children && <span className="w-full text-[12px] text-muted">{children}</span>}
    </div>
  );
}

export interface PageTargetFieldProps {
  id: string;
  /** 入力値（パスまたは URL）。空のときの扱いは emptyHint の説明どおり */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: ReactNode;
  /** 空欄のときの補足。既定は「トップページを見ます」 */
  emptyHint?: ReactNode;
  className?: string;
}

/**
 * ページ単位のツール用。登録サイトのどのページを見るかだけを指定させる。
 * 空ならトップページ。パス（/service/）でも別サイトの URL でも受け付ける。
 */
export function PageTargetField({
  id,
  value,
  onChange,
  disabled,
  label = "ページ（任意）",
  emptyHint = "空欄にするとトップページを見ます",
  className = "",
}: PageTargetFieldProps) {
  const site = useRegisteredSite();
  const typed = value.trim();
  const resolved = resolvePageUrl(site.siteUrl, value);

  let hint: ReactNode;
  if (typed) hint = resolved ? `対象: ${displayUrl(resolved)}` : "URL として読み取れません";
  else if (site.registered) hint = emptyHint;
  else hint = "設定でホームページを登録するか、ページの URL を入れてください";

  return (
    <Field label={label} htmlFor={id} className={className} hint={hint}>
      <div className="flex items-stretch">
        {site.registered && (
          <span className="flex h-11 shrink-0 items-center rounded-l-md border border-r-0 border-line bg-surface px-3 text-[13px] text-muted">
            {site.domain}
          </span>
        )}
        <Input
          id={id}
          value={value}
          inputMode="url"
          placeholder={site.registered ? "/service/" : "https://example.co.jp/service/"}
          disabled={disabled}
          className={site.registered ? "rounded-l-none" : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  );
}
