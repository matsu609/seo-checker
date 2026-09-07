import { INTEGRATIONS } from "@/lib/features/integrations";
import type { Feature } from "@/lib/features/registry";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { PageHeader } from "./PageHeader";

/**
 * 未実装のツールページ。PageHeader + 準備中カード。
 * 機能担当が page.tsx を置き換えるまでの仮置き。
 */
export function ToolPlaceholder({ feature }: { feature: Feature }) {
  const deps = [
    ...feature.requires.map((k) => ({ key: k, kind: "必須" as const })),
    ...(feature.requiresAny ?? []).map((k) => ({ key: k, kind: "いずれか" as const })),
    ...(feature.optional ?? []).map((k) => ({ key: k, kind: "任意" as const })),
  ];
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader feature={feature} />
      <Card title="この機能は準備中です（実装ブランチで開発中）" description="公開時にこのページで次のことができるようになります。">
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          {feature.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        {deps.length > 0 && (
          <dl className="mt-5 border-t border-line pt-4 text-[13px]">
            <dt className="font-bold text-ink">外部連携</dt>
            <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
              {deps.map((d) => (
                <span key={`${d.kind}:${d.key}`} className="inline-flex items-center gap-1.5">
                  <Badge tone="neutral">{d.kind}</Badge>
                  {INTEGRATIONS[d.key].label}
                  <code className="font-mono text-[11px]">({INTEGRATIONS[d.key].envVars.join(" + ")})</code>
                </span>
              ))}
            </dd>
          </dl>
        )}
      </Card>
    </div>
  );
}
