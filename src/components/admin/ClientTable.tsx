"use client";

/**
 * マスター画面の顧客一覧（操作側）。
 *
 * 1 行 = 1 顧客。契約状況・月額・クーポンは読み取り専用で、
 * 触れるのは機能の個別開放（チェックボックス）と担当代理店（選択）、
 * そして「この方の画面を見る」（代理ログイン）だけ。
 *
 * 保存はどちらも押した瞬間に行う。押した直後に見た目を戻さないよう、
 * 保存中は行の状態を先に進めておき、失敗したら元に戻す。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { toolGroupsForDisplay } from "@/lib/features/registry";
import { planLabel } from "@/lib/plans/catalog";
import type { AgencyRow } from "@/lib/admin/agencies";
import type { ClientRow } from "@/lib/admin/clients";
import { formatDate, planSourceLabel, STATUS_TONE } from "./format";
import { PromoSelect } from "./PromoSelect";

/** 個別開放の対象。設定・料金プランは誰でも使えるので出さない */
const TOGGLEABLE = toolGroupsForDisplay();

/** 担当なしを表す選択肢の値（空文字だと未選択と区別しにくいので明示する） */
const NO_AGENCY = "none";

export interface ClientTableProps {
  initial: ClientRow[];
  /** 無料診断の上限（回数の表示に使う） */
  freeRunLimit?: number;
  /** 担当代理店の選択肢。代理店を足す・外すと親から入れ替わる */
  agencies: AgencyRow[];
}

export function ClientTable({ initial, agencies, freeRunLimit = 2 }: ClientTableProps) {
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

  async function assign(userId: string, value: string) {
    const agencyId = value === NO_AGENCY ? null : value;
    const key = `${userId}:agency`;
    setBusy(key);
    setError(null);
    const before = rows;
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, agencyId } : r)));
    try {
      const res = await fetch("/api/admin/clients/agency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, agencyId }),
      });
      const body = (await res.json().catch(() => ({}))) as { agencyId?: string | null; error?: string };
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      setRows((prev) =>
        prev.map((r) => (r.userId === userId ? { ...r, agencyId: body.agencyId ?? null } : r)),
      );
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  /**
   * そのお客様の画面をそのまま開く（代理ログイン）。
   *
   * 押すといまのログインがお客様のものに置き換わるので、必ず 1 枚挟んで止める。
   * 戻るときは画面の下に出る帯の「終了して自分に戻る」から。
   */
  async function impersonate(row: ClientRow) {
    const label = row.email || row.name || row.userId;
    if (
      !window.confirm(
        `${label} さんの画面を開きます。\n\n` +
          "・いまのログインがこの方のものに置き換わります（30 分で切れます）\n" +
          "・画面の下の帯から、いつでも自分に戻れます\n" +
          "・お支払いの操作はできません（確認のための機能です）",
      )
    ) {
      return;
    }
    const key = `${row.userId}:impersonate`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: row.userId }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? `代理ログインを開始できませんでした（HTTP ${res.status}）`);
      }
      // Clerk のチケットを受け取る URL。ここへ遷移した時点でお客様としてのログインになる
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "代理ログインを開始できませんでした");
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

      {rows.map((row) => {
        const isAgency = agencies.some((a) => a.userId === row.userId);
        // 代理店を解除したあとも担当の割り当ては残る。選択肢に無い値を
        // 黙って「担当なし」に見せると、解除済みなのに気づけないので明示する
        const orphan = row.agencyId !== null && !agencies.some((a) => a.userId === row.agencyId);
        return (
          <Card
            key={row.userId}
            title={row.email || row.name || row.userId}
            description={row.name || undefined}
            actions={
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === `${row.userId}:impersonate`}
                onClick={() => void impersonate(row)}
                title="このお客様としてログインし、画面の見え方をそのまま確認します"
              >
                この方の画面を見る
              </Button>
            }
          >
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
                    <span className="ml-1 text-[11px] text-muted">（{planSourceLabel(row.planSource)}）</span>
                    {/*
                      Clerk 側のプラン名は、アプリのプラン名と食い違うときだけ出す。
                      同じときに並べても読みにくいだけで、ずれているときが問題なので。
                    */}
                    {row.billing.planName && row.billing.planName !== planLabel(row.plan) && (
                      <span
                        className={`ml-1 text-[11px] ${row.billing.plan === null ? "text-warn" : "text-muted"}`}
                        title={
                          row.billing.plan === null
                            ? "Clerk 側のプランのスラッグが light / standard / premium のいずれでもありません。このままだと決済は通っても機能が開きません。"
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

              {/* 登録情報（無料診断の前に集める 4 項目）と無料診断の回数 */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-sm border border-line bg-surface p-3 @lg:grid-cols-5">
                <div>
                  <dt className="text-[11px] text-muted">担当者名</dt>
                  <dd className="mt-1 text-sm text-ink">{row.lead?.contactName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">会社名</dt>
                  <dd className="mt-1 text-sm text-ink">{row.lead?.company || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">電話番号</dt>
                  <dd className="mt-1 text-sm text-ink tabular-nums">{row.lead?.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">店舗の種類</dt>
                  <dd className="mt-1 text-sm text-ink">{row.lead?.storeType || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">無料診断</dt>
                  <dd className="mt-1 text-sm text-ink tabular-nums">
                    {row.freeRuns} / {freeRunLimit} 回{row.freeRuns >= freeRunLimit && row.plan === "free" && <span className="ml-1 text-[11px] text-warn">使い切り</span>}
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

              {/* 担当代理店 */}
              <div>
                <label
                  className="text-[12px] font-bold text-ink"
                  htmlFor={`agency-${row.userId}`}
                >
                  担当代理店
                  <span className="ml-2 font-normal text-muted">
                    選んだ代理店の画面に、このお客様が出るようになります。
                  </span>
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Select
                    id={`agency-${row.userId}`}
                    className="max-w-xs"
                    value={row.agencyId ?? NO_AGENCY}
                    disabled={busy === `${row.userId}:agency` || isAgency}
                    onChange={(e) => void assign(row.userId, e.target.value)}
                  >
                    <option value={NO_AGENCY}>担当なし</option>
                    {agencies
                      .filter((a) => a.userId !== row.userId)
                      .map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.email || a.name || a.userId}
                        </option>
                      ))}
                    {orphan && (
                      <option value={row.agencyId as string}>
                        解除済みの代理店（{row.agencyId}）
                      </option>
                    )}
                  </Select>
                  {isAgency && (
                    <span className="text-[12px] text-muted">
                      このアカウントは代理店です（代理店に担当は付けません）。
                    </span>
                  )}
                  {orphan && !isAgency && (
                    <span className="text-[12px] text-warn">
                      いまの担当は代理店ではありません（解除済み）。見えていない状態です。
                    </span>
                  )}
                </div>
              </div>

              {/* 割引（スタンダード専用）。代理店画面からも同じものを設定できる */}
              {!isAgency && <PromoSelect userId={row.userId} value={row.promo} endpoint="/api/admin/promo" subscribed={row.billing.status === "active" || row.billing.status === "trial"} />}

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
        );
      })}
    </div>
  );
}
