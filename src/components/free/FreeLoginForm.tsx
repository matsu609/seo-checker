"use client";

/**
 * 無料診断の専用ログインのフォーム（/free/login）。POST /api/free/login に ID とパスワードを送り、
 * 通れば redirect_url（無ければ無料診断のサイト診断 `/`）へ移る。
 * Clerk は使わない（お客様のアカウントとは別の入口。利用者の決定 2026-10-02）。
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { apiErrorMessage, requestFailedMessage } from "@/lib/api/client";
import { FREE_PATHS } from "@/lib/free/upsell";

/** 戻り先は同じサイト内のパスだけ許す（外部 URL への転送に使われないように） */
export function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return FREE_PATHS.site;
  return value;
}

export function FreeLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!id.trim() || !password) {
      setError("ID とパスワードを入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/free/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: id.trim(), password }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, requestFailedMessage));
      router.replace(safeRedirectPath(params.get("redirect_url")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-sm border border-line bg-panel p-6" noValidate>
      <h1 className="text-[20px] font-bold text-ink">無料診断ログイン</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        サイト・店舗の無料クイック診断を使うための専用ログインです。お客様のアカウント（メールアドレス）とは別の、運営者からお渡しした ID とパスワードを入力してください。
      </p>
      {!configured && (
        <Callout tone="warn" className="mt-4" title="いまは準備中です">
          無料診断の ID とパスワードがまだ設定されていません。運営者にご連絡ください。
        </Callout>
      )}
      {error && (
        <Callout tone="fail" className="mt-4">
          {error}
        </Callout>
      )}
      <div className="mt-4 space-y-3">
        <Field label="ID" htmlFor="free-id">
          <Input id="free-id" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} maxLength={200} disabled={!configured} />
        </Field>
        <Field label="パスワード" htmlFor="free-password">
          <Input id="free-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} disabled={!configured} />
        </Field>
      </div>
      <Button type="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={!configured}>
        ログインして無料診断へ
      </Button>
    </form>
  );
}
