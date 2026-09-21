/**
 * 設計書（運用者だけ）。
 *
 * この SEO Checker を作る上で必要だったサービス・連携したサービスを、**どの機能実装に使ったか**
 * まで含めて 1 枚で読めるようにする（利用者の指示 2026-09-21「このサービスの設計書みたいなものが
 * そのタブから見れるといいですね」）。
 *
 * 中身はコードの定義から組む: 連携の一覧は src/lib/features/integrations.ts、機能ごとの依存は
 * src/lib/features/registry.ts、それをつなぐ説明は src/lib/design/blueprint.ts。ここに文言を直書きしない。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { isAdmin } from "@/lib/admin/guard";
import {
  blueprintFeatures,
  COST_KIND_LABELS,
  DEPENDENCY_MARKS,
  dependencyLevel,
  DESIGN_DOCS,
  docUrl,
  featuresUsing,
  matrixColumns,
  OVERVIEW_DIAGRAM,
  RETIRED,
  SERVICE_BLUEPRINTS,
} from "@/lib/design/blueprint";
import { INTEGRATION_GROUP_LABELS, INTEGRATIONS, integrationsByGroup } from "@/lib/features/integrations";
import { planPriceLabel } from "@/lib/plans/catalog";
import { releaseCount, releaseLabel } from "@/lib/release/catalog";

export const metadata: Metadata = {
  title: "設計書",
  description: "このサービスがどのサービス・API の上に載っていて、どの機能に使っているか。",
  robots: { index: false, follow: false },
};

const COST_TONE = { fixed: "info", variable: "warn", fee: "neutral", free: "pass" } as const;

export default async function Page() {
  await connection();
  if (!(await isAdmin())) notFound();

  const features = blueprintFeatures();
  const columns = matrixColumns();
  const groups = integrationsByGroup();

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        設計書
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        この SEO Checker がどのサービスの上に載っていて、それぞれをどの機能に使っているかをまとめています（版 {releaseLabel(releaseCount())}）。
        中身はコードの定義（連携の一覧・機能ごとの依存）から組んでいるので、機能を足すと自動で増えます。設定の有無と料金は{" "}
        <Link href="/admin" className="text-accent underline">
          マスター画面
        </Link>
        の「外部連携」と「月額費用の試算」に。
      </p>

      {/* 1. 何のサービスか */}
      <Card title="このサービスは何か" number={1} className="mb-6">
        <p className="text-[13px] leading-relaxed text-ink">
          <strong>AIO 対策の可視化ツール</strong>。AIO 対策 = SEO（お客様のホームページの最適化）+ MEO（Google マップ・口コミ）+
          サイテーション（店名・住所・電話をウェブに揃えて載せる）の総称で、AI 検索に引用・言及される状態をつくる。
          お客様の作業を要らなくするのが前提（URL か店名を入れるだけ。Google の連携・タグ設置は求めない）。
        </p>
        <ul className="mt-3 grid gap-2 text-[12px] leading-relaxed text-ink @xl:grid-cols-3">
          <li className="rounded-sm border border-line bg-surface p-3">
            <div className="text-[11px] font-bold text-muted">入口（見込み客）</div>
            クイック診断（サイト・店舗）。アカウント登録のあと 2 回まで。デモ枠は月 50 回
          </li>
          <li className="rounded-sm border border-line bg-surface p-3">
            <div className="text-[11px] font-bold text-muted">売り物</div>
            ライト {planPriceLabel("light")}（診断と計測）／ スタンダード {planPriceLabel("standard")}（+ AI が改修案・原稿・返信文を作る）／ プレミアム {planPriceLabel("premium")}
          </li>
          <li className="rounded-sm border border-line bg-surface p-3">
            <div className="text-[11px] font-bold text-muted">設計の柱</div>
            自前 DB を持たない（アカウントは Clerk、設定はブラウザ、時系列だけ Supabase）。キーは 1 本も画面に出さない。ダミーで動いているように見せない
          </li>
        </ul>
      </Card>

      {/* 2. 全体像 */}
      <Card title="全体像（どこに何があるか）" number={2} description="コード → 実行環境 → ブラウザ → 各サービス。矢印は依存の向き。" className="mb-6">
        <pre className="overflow-x-auto rounded-sm border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink">{OVERVIEW_DIAGRAM}</pre>
      </Card>

      {/* 3. サービスごと */}
      <Card
        title="使っているサービスと、どの機能実装に使ったか"
        number={3}
        description="マスター画面の「外部連携」と同じ並び。「使っている機能」の ● ◍ ○ はコードの定義（registry）から、その下の箇条書きは registry に載らない使い方も含めた説明。"
        className="mb-6"
      >
        <div className="space-y-6">
          {groups.map(({ group, keys }) => (
            <section key={group}>
              <h3 className="text-[13px] font-bold text-ink">{INTEGRATION_GROUP_LABELS[group].label}</h3>
              <p className="mb-2 text-[11px] leading-relaxed text-muted">{INTEGRATION_GROUP_LABELS[group].description}</p>
              <ul className="divide-y divide-line border-y border-line">
                {keys.map((key) => {
                  const meta = INTEGRATIONS[key];
                  const b = SERVICE_BLUEPRINTS[key];
                  const using = featuresUsing(key);
                  return (
                    <li key={key} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-ink">{meta.label}</span>
                        <Badge tone={COST_TONE[b.costKind]} icon={false}>
                          {COST_KIND_LABELS[b.costKind]}
                        </Badge>
                        <Badge tone="neutral" icon={false}>
                          契約: {b.payer}
                        </Badge>
                        {meta.envVars.map((v) => (
                          <code key={v} className="rounded-sm border border-line bg-surface px-1 font-mono text-[11px] text-ink">
                            {v}
                          </code>
                        ))}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink">{b.role}</p>
                      <dl className="mt-2 grid gap-3 text-[12px] leading-relaxed @xl:grid-cols-[1fr_1fr]">
                        <div>
                          <dt className="text-[11px] font-bold text-muted">どの機能実装に使ったか</dt>
                          <dd>
                            <ul className="list-disc space-y-0.5 pl-4 text-ink">
                              {b.usedFor.map((u) => (
                                <li key={u}>{u}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-bold text-muted">使っている機能（コードの定義）</dt>
                          <dd>
                            {using.length === 0 ? (
                              <span className="text-muted">機能の依存としては定義されていない（基盤・ログイン・決済・定期処理）</span>
                            ) : (
                              <ul className="flex flex-wrap gap-1.5">
                                {using.map(({ feature, level }) => (
                                  <li key={feature.id}>
                                    <Link
                                      href={feature.path}
                                      className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-ink hover:bg-surface"
                                      title={DEPENDENCY_MARKS[level].label}
                                    >
                                      <span aria-hidden="true">{DEPENDENCY_MARKS[level].mark}</span>
                                      {feature.shortLabel}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </dd>
                          <dt className="mt-2 text-[11px] font-bold text-muted">設定の場所</dt>
                          <dd className="text-ink">{b.configuredAt}</dd>
                          {b.note && (
                            <>
                              <dt className="mt-2 text-[11px] font-bold text-muted">経緯・注意</dt>
                              <dd className="text-ink">{b.note}</dd>
                            </>
                          )}
                        </div>
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {meta.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-accent bg-panel px-2.5 py-0.5 text-[11px] font-bold text-accent hover:bg-accent-soft"
                          >
                            {l.label}
                            <span aria-hidden="true" className="text-[10px]">
                              ↗
                            </span>
                          </a>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      {/* 4. 機能 × 連携 */}
      <Card
        title="機能 × 連携の表"
        number={4}
        description={`${Object.values(DEPENDENCY_MARKS)
          .map((m) => `${m.mark} ${m.label}`)
          .join(" ／ ")}。列は、どこかの機能が依存している連携だけ（基盤・ログイン・決済は全機能に共通なので列にしない）。`}
        className="mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-y border-line text-left text-[11px] text-muted">
                <th className="py-1.5 pr-3 font-bold">機能</th>
                <th className="py-1.5 pr-3 font-bold">プラン</th>
                {columns.map((key) => (
                  <th key={key} className="py-1.5 pr-2 text-center font-bold" title={INTEGRATIONS[key].label}>
                    {INTEGRATIONS[key].label.split("（")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {features.map((f) => (
                <tr key={f.id} className="text-ink">
                  <td className="py-1.5 pr-3">
                    <Link href={f.path} className="font-bold hover:underline">
                      {f.shortLabel}
                    </Link>
                    <span className="ml-1.5 font-mono text-[10px] text-muted">{f.path}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{f.plan === "free" ? "無料" : f.plan === "light" ? "ライト" : f.plan === "standard" ? "スタンダード" : "プレミアム"}</td>
                  {columns.map((key) => {
                    const level = dependencyLevel(f, key);
                    return (
                      <td key={key} className="py-1.5 pr-2 text-center tabular-nums" title={level ? DEPENDENCY_MARKS[level].label : undefined}>
                        {level ? DEPENDENCY_MARKS[level].mark : <span className="text-muted">−</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. やめたもの */}
      <Card title="提供をやめたもの（なぜ無いのか）" number={5} description="聞かれたときの答え。詳しくは OPERATIONS.md の「判断の経緯」。" className="mb-6">
        <ul className="divide-y divide-line border-y border-line text-[12px] leading-relaxed">
          {RETIRED.map((r) => (
            <li key={r.label} className="grid gap-1 py-2 @xl:grid-cols-[1fr_auto_1fr_1fr] @xl:gap-3">
              <span className="font-bold text-ink">{r.label}</span>
              <span className="text-muted tabular-nums">{r.when}</span>
              <span className="text-ink">理由: {r.why}</span>
              <span className="text-ink">代わり: {r.replacedBy}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* 6. 資料 */}
      <Card title="設計資料（GitHub で開く）" number={6} description="コードと一緒に docs/ に置いてある。数字の出し方・仕様・運用の状態はこちら。">
        <ul className="grid gap-2 text-[12px] leading-relaxed @xl:grid-cols-2">
          {DESIGN_DOCS.map((d) => (
            <li key={d.file} className="rounded-sm border border-line bg-surface p-2">
              <a href={docUrl(d)} target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">
                {d.title}
                <span aria-hidden="true" className="ml-1 text-[10px]">
                  ↗
                </span>
              </a>
              <span className="ml-2 font-mono text-[10px] text-muted">{d.file}</span>
              <p className="text-ink">{d.what}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
