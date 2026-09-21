"use client";

/**
 * マスター画面の代理店アカウント（操作側）。
 *
 * できることは 2 つだけ。
 *   追加 … メールアドレスを入れる。登録済みなら代理店にし、未登録なら招待メールを送る
 *   解除 … 代理店でなくする。担当の割り当ては消さない（付け直せばそのまま戻る）
 *
 * 担当の割り当て（誰を見せるか）は顧客管理の画面（/clients）の顧客一覧で行う。
 * ここで両方やると、「管理アカウントを増やす」と「お客様を割り当てる」が
 * 1 つの箱に混ざって読みにくい。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import type { AgencyRow } from "@/lib/admin/agencies";
import { formatDate } from "./format";

export interface AgencyCardProps {
  agencies: AgencyRow[];
  /** 代理店が増減したら顧客一覧の担当欄にも反映する（一覧は親が 1 つだけ持つ） */
  onChange: (agencies: AgencyRow[]) => void;
}

export function AgencyCard({ agencies, onChange }: AgencyCardProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function add() {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        result?: { kind: "promoted" | "invited"; email: string };
        agencies?: AgencyRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `追加できませんでした（HTTP ${res.status}）`);
      if (body.agencies) onChange(body.agencies);
      setEmail("");
      // メールが飛ぶのは「未登録だった」ときだけ。登録済みの相手に権限を付けただけのときに
      // 同じ文面だと、来ないメールを待たせてしまう（利用者の報告 2026-09-21）ので必ず書き分ける
      setNotice(
        body.result?.kind === "invited"
          ? `${body.result.email} に招待メールを送りました。相手が登録を済ませると、この一覧に並びます。届かないときは迷惑メールをご確認ください。`
          : `${body.result?.email ?? value} を管理アカウントにしました。すでに登録済みのアカウントなので、招待メールは送っていません（このままログインすれば使えます）。続けて「顧客管理」で担当のお客様を割り当ててください。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: AgencyRow) {
    // 解除はすぐ効く（相手の画面が閉じる）ので、押し間違いを 1 枚挟んで止める
    const label = row.email || row.name || row.userId;
    if (!window.confirm(`${label} の管理アカウントを解除します。この方からは登録者が見えなくなります。`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/agencies", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: row.userId }),
      });
      const body = (await res.json().catch(() => ({}))) as { agencies?: AgencyRow[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `解除できませんでした（HTTP ${res.status}）`);
      if (body.agencies) onChange(body.agencies);
      setNotice(`${label} の管理アカウントを解除しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解除できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="管理アカウント（旧称: 代理店アカウント）"
      description="管理アカウントは、カードの登録なしでツールを全部使えます。顧客管理の画面には、担当として割り当てた登録者だけが出ます（契約状況の確認・ご意見への返答・割引・機能の個別開放・その方の画面の確認）。マスター画面は見えません。担当の割り当ては顧客管理の画面で行います。"
    >
      <div className="space-y-5">
        {error && (
          <Callout tone="fail" title="エラー">
            {error}
          </Callout>
        )}
        {notice && !error && (
          <Callout tone="info" title="保存しました">
            {notice}
          </Callout>
        )}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Field
            label="管理アカウントにするメールアドレス"
            htmlFor="agency-email"
            className="min-w-[16rem] flex-1"
            hint="すでに登録済みの方はその場で管理アカウントになります（この場合、メールは送りません）。未登録の方にだけ Clerk から招待メールを送ります。"
          >
            <Input
              id="agency-email"
              type="email"
              autoComplete="off"
              placeholder="agency@example.com"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy} disabled={email.trim().length === 0}>
            管理アカウントとして追加
          </Button>
        </form>

        {agencies.length === 0 ? (
          <p className="text-[13px] text-muted">管理アカウントはまだありません。</p>
        ) : (
          <ul className="divide-y divide-line rounded-sm border border-line">
            {agencies.map((row) => (
              <li key={row.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{row.email || row.userId}</p>
                  <p className="text-[11px] text-muted">
                    {row.name && <span className="mr-2">{row.name}</span>}
                    登録 {formatDate(row.createdAt)}
                  </p>
                </div>
                <span className="text-[13px] text-ink tabular-nums">
                  担当 {row.clientCount} 件
                </span>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove(row)}>
                  解除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
