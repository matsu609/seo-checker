"use client";

/**
 * 外部連携（API キー）の設定状況。運用者だけが見るマスター画面に置く
 * （利用者の指示 2026-09-15: お客様に見せる必要はない）。
 * 値は一切返さず、設定の有無（boolean）だけを /api/integrations から読む。
 *
 * 行ごとに開閉できる（利用者の指示 2026-09-16）: 料金・上限・このツールでの
 * 消費量と、公式サイトへのリンク（タップで別タブ）。単価は変わるので、
 * 確認日（PRICING_CHECKED_AT）を出し、リンク先で確かめてもらう前提。
 */
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { INTEGRATIONS, INTEGRATION_KEYS, PRICING_CHECKED_AT, type IntegrationMeta } from "@/lib/features/integrations";
import { useIntegrations } from "@/lib/store/useIntegrations";

export function IntegrationsCard() {
  const { status, loading, error, reload } = useIntegrations();
  return (
    <Card
      title="外部連携（API キーの設定状況）"
      description={`API キーは Vercel の環境変数（開発時は .env.local）にだけ置きます。ここには設定の有無しか出ません。変更後は Redeploy（開発時は再起動）が必要です。各行をタップすると料金・上限・このツールでの消費量と公式サイトへのリンクが開きます（料金・上限は ${PRICING_CHECKED_AT} に確認した値。単価は変わるので、リンク先で確かめてください）。`}
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
      <ul className="divide-y divide-line border-y border-line">
        {INTEGRATION_KEYS.map((key) => (
          <IntegrationRow key={key} meta={INTEGRATIONS[key]} on={status === null ? null : (status[key] ?? false)} />
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">
        変数の一覧と書き方は <code className="font-mono">.env.example</code> を参照してください。
      </p>
    </Card>
  );
}

function IntegrationRow({ meta, on }: { meta: IntegrationMeta; on: boolean | null }) {
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span aria-hidden="true" className="inline-block w-3 shrink-0 text-[11px] text-muted transition-transform group-open:rotate-90">
              ▶
            </span>
            <span className="text-[13px] font-bold text-ink">{meta.label}</span>
            {meta.envVars.map((v) => (
              <code key={v} className="rounded-sm border border-line bg-surface px-1 font-mono text-[11px] text-ink">
                {v}
              </code>
            ))}
            <span className="ml-auto">
              {on === null ? (
                <span className="text-[12px] text-muted">確認中…</span>
              ) : on ? (
                <Badge tone="pass">設定済み</Badge>
              ) : (
                <Badge tone="neutral" icon={false}>
                  未設定
                </Badge>
              )}
            </span>
          </div>
          <p className="mt-1 pl-5 text-[12px] leading-relaxed text-muted">{meta.description}</p>
        </summary>

        <div className="mb-3 ml-5 rounded-sm border border-line bg-surface p-3">
          <dl className="grid gap-3 text-[12px] leading-relaxed @xl:grid-cols-3">
            <Detail title="料金" body={meta.pricing} />
            <Detail title="上限・超えたときの動き" body={meta.limits} />
            <Detail title="このツールでの消費量" body={meta.usage} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {meta.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-accent bg-panel px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent-soft"
              >
                {l.label}
                <span aria-hidden="true" className="text-[10px]">
                  ↗
                </span>
              </a>
            ))}
          </div>
        </div>
      </details>
    </li>
  );
}

function Detail({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <dt className="mb-0.5 text-[11px] font-bold text-muted">{title}</dt>
      <dd className="text-ink">{body}</dd>
    </div>
  );
}
