"use client";

/**
 * 通知の設定（設定画面のカード）。
 *
 * メールで受け取るか・宛先・種類（月次レポート / 変化の知らせ）。値はブラウザ側ストアに保存し、
 * サーバー（user_stores）にも写る。定期処理はサーバー側の写しを読んで送る。
 */
import { useEffect, useState } from "react";
import type { NotificationsResponse } from "@/app/api/notifications/route";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { notificationSettingsStore } from "@/lib/notifications/settings";
import { useStore } from "@/lib/store/hooks";

export function NotificationsCard() {
  const [settings, setSettings] = useStore(notificationSettingsStore);
  const [status, setStatus] = useState<Pick<NotificationsResponse, "enabled" | "mailConfigured"> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as NotificationsResponse) : null))
      .then((body) => {
        if (alive && body) setStatus({ enabled: body.enabled, mailConfigured: body.mailConfigured });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title="通知"
      description="月次レポートと、順位の急落・サイトの事故・掲載の消失・低評価の回答・投稿の失敗の知らせを、画面の「お知らせ」に残します。メールでも受け取れます。"
    >
      {status && !status.mailConfigured && (
        <Callout tone="info" className="mb-4">
          メール送信はまだ準備中です（運用側の設定待ち）。それまでは画面の「お知らせ」（月次レポートの画面）で確認できます。
        </Callout>
      )}
      <div className="space-y-3 text-[13px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.checked })} />
          <span className="font-bold text-ink">メールでも受け取る</span>
          {status?.mailConfigured && <Badge tone="pass" icon={false}>送信可能</Badge>}
        </label>
        <div className="ml-6 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.monthlyReport} disabled={!settings.email} onChange={(e) => setSettings({ ...settings, monthlyReport: e.target.checked })} />
            月次レポート（毎月 1 日）
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.alerts} disabled={!settings.email} onChange={(e) => setSettings({ ...settings, alerts: e.target.checked })} />
            変化の知らせ（順位の急落・サイトの事故・掲載の消失・低評価・投稿の失敗）
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">宛先（空ならログインのメールアドレスに送ります）</span>
            <Input
              type="email"
              value={settings.address}
              disabled={!settings.email}
              placeholder="example@example.co.jp"
              onChange={(e) => setSettings({ ...settings, address: e.target.value.slice(0, 200) })}
              className="max-w-sm"
            />
          </label>
        </div>
      </div>
    </Card>
  );
}
