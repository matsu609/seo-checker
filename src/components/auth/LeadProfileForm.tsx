"use client";

/**
 * 登録情報の補完フォーム（担当者名・会社名・電話・店舗の種類）。
 * Google でログインして登録情報が無い人を無料診断の入口（src/lib/free/gate.ts）がここに送る。
 * 保存は /api/account/lead（publicMetadata.lead）。保存後は元の画面（redirect_url）へ戻る。
 */
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Select } from "@/components/ui/Field";
import { COMPANY_MAX, CONTACT_NAME_MAX, leadFromMetadata, LeadProfileSchema, PHONE_MAX, STORE_TYPES } from "@/lib/free/lead";

type Initial = { contactName: string; company: string; phone: string; storeType: string };

export function LeadProfileForm() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded) return null;
  if (!isSignedIn || !user) {
    return (
      <div className="mx-auto w-full max-w-md rounded-sm border border-line bg-panel p-6 text-[13px] text-ink">
        ログインが必要です。
        <Link href="/sign-in" className="ml-1 font-bold text-accent underline underline-offset-2">
          ログイン
        </Link>
      </div>
    );
  }
  // すでにある値（登録時の unsafeMetadata など）を初期値にして描く（読み込み後に 1 回だけ）
  const initial = leadFromMetadata(user.publicMetadata, user.unsafeMetadata) ?? { contactName: "", company: "", phone: "", storeType: "" };
  return <LeadFields initial={initial} reload={() => user.reload()} />;
}

function LeadFields({ initial, reload }: { initial: Initial; reload: () => Promise<unknown> }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectUrl = params.get("redirect_url") ?? "/";
  const safeRedirect = redirectUrl.startsWith("/") && !redirectUrl.startsWith("//") ? redirectUrl : "/";
  const [form, setForm] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = LeadProfileSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力が正しくありません");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      await reload();
      router.push(safeRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-sm border border-line bg-panel p-6" noValidate>
      <h1 className="text-[20px] font-bold text-ink">登録情報の入力</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">無料診断をご利用いただく前に、次の 4 項目をお願いします。</p>
      {error && (
        <Callout tone="fail" className="mt-4">
          {error}
        </Callout>
      )}
      <div className="mt-4 space-y-3">
        <Field label="担当者名（ご自身のお名前）" htmlFor="contactName">
          <Input id="contactName" autoComplete="name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} maxLength={CONTACT_NAME_MAX} />
        </Field>
        <Field label="会社名（屋号）" htmlFor="company">
          <Input id="company" autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={COMPANY_MAX} />
        </Field>
        <Field label="電話番号" htmlFor="phone">
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={PHONE_MAX} />
        </Field>
        <Field label="店舗の種類" htmlFor="storeType">
          <Select id="storeType" value={form.storeType} onChange={(e) => setForm({ ...form, storeType: e.target.value })}>
            <option value="">選んでください</option>
            {STORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" size="lg" className="mt-4 w-full" loading={busy}>
        保存して進む
      </Button>
    </form>
  );
}
