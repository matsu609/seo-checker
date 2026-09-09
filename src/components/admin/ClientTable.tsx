"use client";

/**
 * マスター画面の顧客一覧（操作側）。
 *
 * 1 行 = 1 顧客。契約状況・月額・クーポンは読み取り専用で、
 * 触れるのは機能の個別開放（チェックボックス）だけ。
 *
 * チェックは押した瞬間に保存する。押した直後に見た目を戻さないよう、
 * 保存中は行の状態を先に進めておき、失敗したら元に戻す。
 */
import { useState } from "react";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { FEATURE_GROUPS } from "@/lib/features/registry";
import { planLabel } from "@/lib/plans/catalog";
import type { ClientRow } from "@/lib/admin/clients";
import type { ContractStatus } from "@/lib/admin/billing";

/** 契約状況の色。支払い遅延だけは目立たせる */
const STATUS_TONE: Record<ContractStatus, string> = {
  active: "text-pass border-pass bg-pass-soft",
  trial: "text-info border-info bg-info-soft",
  past_due: "text-fail border-fail bg-fail-soft",
  canceled: "text-warn border-warn bg-warn-soft",
  ended: "text-muted border-line bg-surface",
  upcoming: "text-info border-info bg-info-soft",
  none: "text-muted border-line bg-surface",
  unknown: "text-muted border-line bg-surface",
};

/** 個別開放の対象。設定・料金プランは誰でも使えるので出さない */
const TOGGLEABLE = FEATURE_GROUPS.filter((g) => g.id !== "free" && g.id !== "settings");

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ClientTable({ initial }: { initial: ClientRow[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: string, featureId: string, enabled: boolean) {
    const key = `${userId}:${featureId}`;
    setBusy(key);
    setError(null);
    const before = rows;
    // 先に反映して、押した感触を止めない
    setRows((prev) =>
      prev.map((r) =>
        r.userId !== userId
          ? r
          : {
              ...r,
              overrides: enabled
                ? [...new Set([...r.overrides, featureId])]
                : r.overrides.filter((f) => f !== featureId),
            },
      ),
    );
    try {
      const res = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, featureId, enabled }),
      });
      const body = (await res.json().catch(() => ({}))) as { overrides?: string[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      // サーバーが返した確定値で置き換える
      setRows((prev) =>
        prev.map((r) => (r.userId === userId ? { ...r, overrides: body.overrides ?? r.overrides } : r)),
      );
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Callout tone="info" title="まだ顧客がいません">
        ログインしたアカウントがここに並びます。
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Callout tone="fail" title="エラー">
          {error}
        </Callout>
      )}

      {rows.map((row) => (
        <Card key={row.userId} title={row.email || row.name || row.userId} description={row.name || undefined}>
          <div className="space-y-5">
            {/* 契約 */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-4">
              <div>
                <dt className="text-[11px] text-muted">契約状況</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 ${STATUS_TONE[row.billing.status]}`}
                  >
                    {row.billing.statusLabel}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">月額</dt>
                <dd className="mt-1 text-[15px] font-bold text-ink tabular-nums">
                  {row.billing.monthly ? row.billing.monthly.label : "—"}
                  {row.billing.coupon && row.billing.subtotal && row.billing.monthly &&
                    row.billing.subtotal.value !== row.billing.monthly.value && (
                      <span className="ml-1.5 text-[12px] font-normal text-muted line-through">
                        {row.billing.subtotal.label}
                      </span>
                    )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">プラン</dt>
                <dd className="mt-1 text-sm text-ink">
                  {planLabel(row.plan)}
                  <span className="ml-1 text-[11px] text-muted">
                    （
                    {row.planSource === "billing"
                      ? "契約"
                      : row.planSource === "metadata"
                        ? "手動"
                        : row.planSource === "env"
                          ? "既定"
                          : "無料"}
                    ）
                  </span>
                  {/*
                    Clerk 側のプラン名は、アプリのプラン名と食い違うときだけ出す。
                    同じときに並べても読みにくいだけで、ずれているときが問題なので。
                  */}
                  {row.billing.planName && row.billing.planName !== planLabel(row.plan) && (
                    <span
                      className={`ml-1 text-[11px] ${row.billing.plan === null ? "text-warn" : "text-muted"}`}
                      title={
                        row.billing.plan === null
                          ? "Clerk 側のプランのスラッグが standard / pro のどちらでもありません。このままだと決済は通っても機能が開きません。"
                          : undefined
                      }
                    >
                      Clerk: {row.billing.planName}
                      {row.billing.plan === null && " ⚠"}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">次回請求</dt>
                <dd className="mt-1 text-sm text-ink tabular-nums">
                  {formatDate(row.billing.nextPaymentAt)}
                </dd>
              </div>
            </dl>

            {/* クーポン */}
            {row.billing.coupon ? (
              <div className="rounded-sm border border-line bg-surface p-3 text-[13px]">
                <span className="font-bold text-ink">クーポン適用中</span>
                <span className="ml-2 text-ink">{row.billing.coupon.name}</span>
                <span className="ml-2 text-accent">{row.billing.coupon.effectLabel}</span>
                {row.billing.coupon.promoCode && (
                  <span className="ml-2 font-mono text-[12px] text-muted">
                    {row.billing.coupon.promoCode}
                  </span>
                )}
                <span className="ml-2 text-[12px] text-muted">
                  {row.billing.coupon.cyclesRemaining === null
                    ? "無期限"
                    : `残り ${row.billing.coupon.cyclesRemaining} 回`}
                </span>
              </div>
            ) : (
              <p className="text-[12px] text-muted">クーポンの適用はありません。</p>
            )}

            {/* 機能の個別開放 */}
            <div>
              <p className="text-[12px] font-bold text-ink">
                機能の個別開放
                <span className="ml-2 font-normal text-muted">
                  プランで使えるものに加えて開きます。ここでは塞げません。
                </span>
              </p>
              <div className="mt-2 space-y-3">
                {TOGGLEABLE.map((group) => (
                  <div key={group.id}>
                    <p className="text-[11px] text-muted">{group.label}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                      {group.features.map((f) => {
                        const checked = row.overrides.includes(f.id);
                        const key = `${row.userId}:${f.id}`;
                        return (
                          <label
                            key={f.id}
                            className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-ink"
                            title={`${f.label}（${planLabel(f.plan)}プラン）`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy === key}
                              onChange={(e) => void toggle(row.userId, f.id, e.target.checked)}
                              className="h-4 w-4 accent-accent"
                            />
                            <span>{f.shortLabel}</span>
                            <span className="text-[10px] text-muted">{planLabel(f.plan)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted">
              登録 {formatDate(row.createdAt)} · 最終利用 {formatDate(row.lastActiveAt)}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
