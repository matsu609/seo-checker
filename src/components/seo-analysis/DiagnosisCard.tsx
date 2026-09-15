"use client";

/**
 * 数字の診断（Search Console / GA4 のルール判定）のカード。
 *
 * docs/dev/diagnosis-rules-spec.md の分担のうち「診断はルール」の部分を、
 * AI を通さずそのまま見せる。AI の文章は別のカードにあるので、ここは
 * **何が発火して、根拠の数値は何で、何を断定してはいけないか**を機械的に並べる。
 * 発火しなかった理由（連携が無い等）も同じ重さで出す。
 */
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { CONFIDENCE_LABELS, EFFORT_LABELS, RULE_CATEGORY_LABELS, RULE_SEVERITY_LABELS, type DiagnosisResult, type RuleSeverity, type TriggeredRule } from "@/lib/diagnosis/types";
import { PENDING_RULES } from "@/lib/diagnosis/rules";

const TONE: Record<RuleSeverity, "fail" | "warn" | "neutral"> = {
  critical: "fail",
  high: "fail",
  medium: "warn",
  low: "neutral",
};

function pct(v: number | null, digits = 1): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function signed(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function DiagnosisCard({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const { triggered, summary } = diagnosis;
  const counts = {
    critical: triggered.filter((t) => t.severity === "critical").length,
    high: triggered.filter((t) => t.severity === "high").length,
    medium: triggered.filter((t) => t.severity === "medium").length,
    low: triggered.filter((t) => t.severity === "low").length,
  };

  return (
    <Card
      title="数字の診断（Search Console の推移）"
      description="集計と判定はプログラムが行っています（AI は使っていません）。発火した項目は「確認できた事実」であって原因ではないため、原因候補と「まだ確認が必要なこと」を必ず併記しています。"
      printCard
      actions={
        <Badge tone={counts.critical + counts.high > 0 ? "fail" : counts.medium > 0 ? "warn" : "pass"} icon={false}>
          {triggered.length} 件
        </Badge>
      }
    >
      {summary && (
        <div className="mb-4 grid gap-2 rounded-lg border border-line bg-surface-2 p-3 text-[12px] @xl:grid-cols-2">
          <div>
            <span className="text-muted">対象: </span>
            {summary.siteUrl}
          </div>
          <div>
            <span className="text-muted">期間: </span>
            {diagnosis.period.current?.startDate}〜{diagnosis.period.current?.endDate}（{diagnosis.period.daysCurrent} 日）／前期 {diagnosis.period.previous?.startDate}〜{diagnosis.period.previous?.endDate}
          </div>
          <div>
            <span className="text-muted">クリック: </span>
            {summary.totals.current.clicks.toLocaleString("ja-JP")}（前期比 {signed(summary.clicksChangeRate)}）
            <span className="text-muted"> / 表示: </span>
            {summary.totals.current.impressions.toLocaleString("ja-JP")}（{signed(summary.impressionsChangeRate)}）
          </div>
          <div>
            <span className="text-muted">平均掲載順位: </span>
            {summary.totals.current.position.toFixed(1)}（前期 {summary.totals.previous.position.toFixed(1)}）
          </div>
          <div className="@xl:col-span-2 text-muted">
            クエリ取得率 {pct(summary.queryCoverage, 0)}／指名クリック比率 {pct(summary.brandClickShare, 0)}
            ｜ どちらも「一覧に出ているクエリの中での比率」で、サイト全体の比率ではありません
          </div>
        </div>
      )}

      {triggered.length === 0 ? (
        <p className="text-[13px] text-muted">発火した診断項目はありません。判定に使えたデータの範囲は下の「判定していないこと」を見てください。</p>
      ) : (
        <ul className="space-y-2">
          {triggered.map((t) => (
            <li key={t.id} className="rounded-lg border border-line">
              <button
                type="button"
                className="flex w-full items-start gap-3 p-3 text-left"
                onClick={() => setOpen(open === t.id ? null : t.id)}
                aria-expanded={open === t.id}
              >
                <Badge tone={TONE[t.severity]} icon={false}>
                  {RULE_SEVERITY_LABELS[t.severity]}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    <span className="text-muted">{t.id}</span> {t.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">{t.evidence[0]}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted print:hidden">{open === t.id ? "閉じる" : "詳しく"}</span>
              </button>
              <div className={open === t.id ? "border-t border-line p-3 text-[12px]" : "hidden border-t border-line p-3 text-[12px] print:block"}>
                <Detail rule={t} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 @2xl:grid-cols-2">
        <section>
          <h3 className="text-[12px] font-medium">判定していないこと</h3>
          <ul className="mt-1 space-y-1 text-[12px] text-muted">
            {diagnosis.limitations.map((l) => (
              <li key={l}>・{l}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-[12px] font-medium">データが揃えば判定できる項目</h3>
          <ul className="mt-1 space-y-1 text-[12px] text-muted">
            {PENDING_RULES.map((r) => (
              <li key={r.id}>
                ・{r.id} {r.name}（要: {r.needs}）
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        判定ルールの版 {diagnosis.rulesVersion} ／ 閾値の版 {diagnosis.thresholdsVersion}。同じデータと同じ版なら、同じ項目が発火します。
      </p>
    </Card>
  );
}

function Detail({ rule }: { rule: TriggeredRule }) {
  return (
    <dl className="grid gap-2 @xl:grid-cols-2">
      <Row label="分類">{RULE_CATEGORY_LABELS[rule.category]}</Row>
      <Row label="確度">{CONFIDENCE_LABELS[rule.confidence]}</Row>
      <Row label="確認できた事実" wide>
        {rule.fact}
      </Row>
      <Row label="根拠の数値" wide>
        <ul className="space-y-0.5">
          {rule.evidence.map((e, i) => (
            <li key={i}>・{e}</li>
          ))}
        </ul>
      </Row>
      <Row label="原因候補（断定ではありません）">
        <ul className="space-y-0.5">
          {rule.possibleCauses.map((c) => (
            <li key={c}>・{c}</li>
          ))}
        </ul>
      </Row>
      <Row label="まだ確認が必要なこと">
        <ul className="space-y-0.5">
          {rule.requiredChecks.map((c) => (
            <li key={c}>・{c}</li>
          ))}
        </ul>
      </Row>
      <Row label={`打ち手（手間: ${EFFORT_LABELS[rule.effort]}）`} wide>
        <ul className="space-y-0.5">
          {rule.recommendedActions.map((a) => (
            <li key={a}>・{a}</li>
          ))}
        </ul>
      </Row>
      {rule.prohibitedConclusions.length > 0 && (
        <Row label="この数字から言ってはいけないこと" wide>
          <ul className="space-y-0.5">
            {rule.prohibitedConclusions.map((c) => (
              <li key={c}>・{c}</li>
            ))}
          </ul>
        </Row>
      )}
      {rule.subjects.length > 0 && (
        <Row label="対象" wide>
          <span className="break-all">{rule.subjects.slice(0, 10).join(" / ")}</span>
        </Row>
      )}
    </dl>
  );
}

function Row({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "@xl:col-span-2" : undefined}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
