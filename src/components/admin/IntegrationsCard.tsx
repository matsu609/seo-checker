"use client";

/**
 * 外部連携（API キー）の設定状況。運用者だけが見るマスター画面に置く
 * （利用者の指示 2026-09-15: お客様に見せる必要はない）。
 * 値は一切返さず、設定の有無（boolean）だけを /api/integrations から読む。
 */
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { INTEGRATIONS, INTEGRATION_KEYS } from "@/lib/features/integrations";
import { useIntegrations } from "@/lib/store/useIntegrations";

export function IntegrationsCard() {
  const { status, loading, error, reload } = useIntegrations();
  return (
    <Card
      title="外部連携（API キーの設定状況）"
      description="API キーは Vercel の環境変数（開発時は .env.local）にだけ置きます。ここには設定の有無しか出ません。変更後は Redeploy（開発時は再起動）が必要です。運用者だけが見る画面なので、お客様の設定画面には出しません。"
      actions={
        <Button size="sm" variant="secondary" onClick={reload} loading={loading}>
          再確認
        </Button>
      }
    >
      {error && (
        <Callout tone="warn" className="mb-4">
          {error}
        </Callout>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-ink">
          <thead>
            <tr className="border-b border-line text-[12px] font-bold text-muted">
              <th className="px-2 py-2 text-left">連携</th>
              <th className="px-2 py-2 text-left">環境変数</th>
              <th className="px-2 py-2 text-left">状態</th>
              <th className="px-2 py-2 text-left">用途</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATION_KEYS.map((key) => {
              const meta = INTEGRATIONS[key];
              const on = status?.[key] ?? false;
              return (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 font-bold whitespace-nowrap">{meta.label}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {meta.envVars.map((v) => (
                        <code key={v} className="rounded-sm border border-line bg-surface px-1 font-mono text-[11px]">
                          {v}
                        </code>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {status === null ? (
                      <span className="text-[12px] text-muted">確認中…</span>
                    ) : on ? (
                      <Badge tone="pass">設定済み</Badge>
                    ) : (
                      <Badge tone="neutral" icon={false}>
                        未設定
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted">{meta.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-muted">
        変数の一覧と書き方は <code className="font-mono">.env.example</code> を参照してください。
      </p>
    </Card>
  );
}

