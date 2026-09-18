"use client";

/**
 * アカウント登録フォーム（無料診断の前に 6 項目。利用者の決定 2026-09-18）。
 *
 * Clerk の出来合いの <SignUp /> は会社名・電話・店舗の種類を出せないので、フォームはこちらで作り、
 * 裏で Clerk の useSignUp を使う（メール + パスワードで作成 → 追加項目は unsafeMetadata.lead →
 * メールの確認コード → ログイン → /start が振り分ける）。Google での登録は出さない（項目が集まらないため。
 * Google でログインした人は補完フォーム /sign-up/profile に送られる）。
 *
 * Clerk のボット対策（Smart CAPTCHA）が有効なときは #clerk-captcha に描画されるので、空の div を置いておく。
 */
import { useClerk, useSignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Select } from "@/components/ui/Field";
import { COMPANY_MAX, CONTACT_NAME_MAX, LEAD_KEY, LeadProfileSchema, PHONE_MAX, STORE_TYPES } from "@/lib/free/lead";

/** Clerk の Password 設定（Minimum length）と合わせる。2026-09-18 に Clerk のエラー「Passwords must be 15 characters or more.」で 15 と確認 */
const PASSWORD_MIN = 15;

/** Clerk の英語のエラーを、よくあるものだけ日本語にする */
function clerkMessage(err: { code?: string; message?: string; longMessage?: string } | null | undefined): string {
  {
    const first = err ?? undefined;
    switch (first?.code) {
      case "form_identifier_exists":
        return "このメールアドレスは登録済みです。ログインしてください。";
      case "form_password_pwned":
        return "このパスワードは過去の情報漏えいで流出したことがあるため使えません（数字だけ・単語だけの並びは流出リストに載りやすいです）。英字と数字を混ぜた別のパスワードにしてください。";
      case "form_password_length_too_short":
        return `パスワードは ${PASSWORD_MIN} 文字以上にしてください。`;
      case "form_param_format_invalid":
        return "メールアドレスの形式が正しくありません。";
      case "form_code_incorrect":
        return "確認コードが違います。メールをもう一度ご確認ください。";
      case "verification_expired":
        return "確認コードの期限が切れました。もう一度登録をやり直してください。";
      default:
        return first?.longMessage || first?.message || "登録できませんでした。";
    }
  }
}

interface Form {
  contactName: string;
  email: string;
  company: string;
  phone: string;
  storeType: string;
  password: string;
}

export function RegisterForm() {
  // Clerk v7 の useSignUp（signals API）。create → verifications.sendEmailCode → verifyEmailCode → finalize
  const { signUp, fetchStatus } = useSignUp();
  const clerk = useClerk();
  const isLoaded = fetchStatus !== undefined;
  const router = useRouter();
  const [form, setForm] = useState<Form>({ contactName: "", email: "", company: "", phone: "", storeType: "", password: "" });
  const [step, setStep] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    const lead = LeadProfileSchema.safeParse({ contactName: form.contactName, company: form.company, phone: form.phone, storeType: form.storeType });
    if (!lead.success) {
      setError(lead.error.issues[0]?.message ?? "入力が正しくありません");
      return;
    }
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("メールアドレスの形式が正しくありません。");
      return;
    }
    if (form.password.length < PASSWORD_MIN) {
      setError(`パスワードは ${PASSWORD_MIN} 文字以上にしてください。`);
      return;
    }
    setBusy(true);
    try {
      // legalAccepted: フォームに規約・ポリシーへの同意文があるので、Clerk の「規約への同意」が必須設定でも止まらないようにする
      const created = await signUp.create({ emailAddress: email, password: form.password, legalAccepted: true, unsafeMetadata: { [LEAD_KEY]: lead.data } });
      if (created.error) {
        setError(clerkMessage(created.error));
        return;
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setError(clerkMessage(sent.error));
        return;
      }
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "登録できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setBusy(true);
    try {
      const verified = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (verified.error) {
        setError(clerkMessage(verified.error));
        return;
      }
      // 確認後の最新の状態は Clerk のクライアント側リソースから読む（フックが返した値は押した時点の写し。
      // 写しの finalize() は「Cannot finalize sign-up without a created session」で止まることがある。2026-09-18）
      const current = clerk.client?.signUp;
      const sessionId = current?.createdSessionId ?? signUp.createdSessionId ?? null;
      if (current?.status === "complete" && sessionId) {
        // ログイン状態にする。/start が契約状況で振り分ける（登録直後は未契約なので無料診断へ）
        await clerk.setActive({ session: sessionId });
        router.push("/start");
        return;
      }
      if (sessionId) {
        await clerk.setActive({ session: sessionId });
        router.push("/start");
        return;
      }
      // 何が足りないかを画面に出す（Clerk 側の必須項目や追加の確認が残っているとき）
      const missing = (current?.missingFields ?? []).join(", ") || "なし";
      const unverified = (current?.unverifiedFields ?? []).join(", ") || "なし";
      setError(`登録が完了していません（状態: ${current?.status ?? "不明"} / 不足している項目: ${missing} / 未確認: ${unverified}）。この表示をそのまま運営者にお知らせください。`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "確認が完了しませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (step === "verify") {
    return (
      <form onSubmit={verify} className="mx-auto w-full max-w-md rounded-sm border border-line bg-panel p-6" noValidate>
        <h1 className="text-[20px] font-bold text-ink">メールアドレスの確認</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          <span className="font-bold text-ink">{form.email.trim()}</span> に 6 桁の確認コードを送りました。届いたコードを入力してください（迷惑メールに入ることがあります）。
        </p>
        {error && (
          <Callout tone="fail" className="mt-4">
            {error}
          </Callout>
        )}
        <Field label="確認コード" htmlFor="code" className="mt-4">
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={10} />
        </Field>
        <Button type="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={!isLoaded || code.trim().length < 4}>
          確認して無料診断へ進む
        </Button>
        <button type="button" onClick={() => setStep("form")} className="mt-3 text-[12px] text-muted underline underline-offset-2">
          入力内容を直す
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-sm border border-line bg-panel p-6" noValidate>
      <h1 className="text-[20px] font-bold text-ink">アカウント登録（無料）</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        登録すると、サイトと店舗の無料診断をメールアドレスごとに 2 回までご利用いただけます。カードの登録は不要です。
      </p>
      {error && (
        <Callout tone="fail" className="mt-4">
          {error}
        </Callout>
      )}
      <div className="mt-4 space-y-3">
        <Field label="担当者名（ご自身のお名前）" htmlFor="contactName">
          <Input id="contactName" autoComplete="name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} maxLength={CONTACT_NAME_MAX} placeholder="山田 太郎" />
        </Field>
        <Field label="メールアドレス" htmlFor="email" hint="確認コードをお送りします">
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.co.jp" />
        </Field>
        <Field label="会社名（屋号）" htmlFor="company">
          <Input id="company" autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} maxLength={COMPANY_MAX} placeholder="株式会社〇〇 / 〇〇歯科クリニック" />
        </Field>
        <Field label="電話番号" htmlFor="phone">
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={PHONE_MAX} placeholder="03-1234-5678" />
        </Field>
        <Field label="店舗の種類" htmlFor="storeType">
          <Select id="storeType" value={form.storeType} onChange={(e) => set("storeType", e.target.value)}>
            <option value="">選んでください</option>
            {STORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="パスワード" htmlFor="password" hint={`${PASSWORD_MIN} 文字以上。英字と数字を混ぜてください。過去に流出したことのあるパスワード（数字だけ・単語だけなど）は使えません`}>
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} minLength={PASSWORD_MIN} />
        </Field>
      </div>
      {/* Clerk のボット対策（Smart CAPTCHA）がここに描画される */}
      <div id="clerk-captcha" className="mt-3" />
      <Button type="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={!isLoaded}>
        登録して無料診断へ進む
      </Button>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        登録により
        <Link href="/terms" className="mx-1 underline underline-offset-2">
          利用規約
        </Link>
        と
        <Link href="/privacy" className="mx-1 underline underline-offset-2">
          プライバシーポリシー
        </Link>
        に同意したものとします。
      </p>
      <p className="mt-3 text-[13px] text-muted">
        すでにアカウントをお持ちの方は
        <Link href="/sign-in" className="ml-1 font-bold text-accent underline underline-offset-2">
          ログイン
        </Link>
      </p>
    </form>
  );
}
