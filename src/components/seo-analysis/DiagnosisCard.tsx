"use client";

/**
 * 数字の診断（Search Console / GA4 のルール判定）のカード。
 *
 * docs/dev/diagnosis-rules-spec.md の分担のうち「診断はルール」の部分を、
 * AI を通さずそのまま見せる。
 *
 * 読む順番を決めているのがこのカードの仕事:
 *   1. まず手を付けるところ（上位 3 件。§15）
 *   2. 訪問後の流れ（どこで落ちているか）
 *   3. 発火したその他の項目（重要なものだけ開き、残りは折りたたむ）
 *   4. 判定していないこと → 次に何をつなぐと何が分かるか
 *
 * 発火項目を全部平置きにしない。ルール ID（T02 など）は内部の符号なので
 * 先頭に置かず、詳細を開いたときだけ出す。
 */
import { useState } from "react";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { buildDiagnosisView, buildFunnel, nextSteps, type FunnelView } from "@/lib/diagnosis/summary";
import {
  CONFIDENCE_LABELS,
  EFFORT_LABELS,
  RULE_CATEGORY_LABELS,
  RULE_SEVERITY_LABELS,
  type DiagnosisResult,
  type Ga4Summary,
  type RuleSeverity,
  type TriggeredRule,
} from "@/lib/diagnosis/types";

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

const num = (v: number) => v.toLocaleString("ja-JP");

export function DiagnosisCard({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const view = buildDiagnosisView(diagnosis);
  const { summary, ga4 } = diagnosis;
  const total = diagnosis.triggered.length;

  return (
    <Card
      title="数字の診断"
      description="Search Console と GA4 の数字から、プログラムが機械的に判定した結果です（AI は使っていません）。ここに出るのは「確認できた事実」で、原因ではありません。原因の候補と「まだ確認が必要なこと」を各項目に付けています。"
      printCard
      actions={
        total > 0 && view.emptyReason === null ? (
          <Badge tone={view.counts.critical + view.counts.high > 0 ? "fail" : view.counts.medium > 0 ? "warn" : "neutral"} icon={false}>
            {total} 件
          </Badge>
        ) : null
      }
    >
      {view.emptyReason === "no-data" || view.emptyReason === "no-issues" ? (
        <EmptyNotice reason={view.emptyReason} />
      ) : (
        <TopIssues issues={view.top} />
      )}

      {ga4 && <Funnel ga4={ga4} />}

      {summary && <Totals summary={summary} period={diagnosis.period} />}

      {(view.important.length > 0 || view.minor.length > 0) && (
        <RuleList important={view.important} minor={view.minor} />
      )}

      <NextSteps diagnosis={diagnosis} />

      <p className="mt-3 text-[11px] text-muted">
        判定ルールの版 {diagnosis.rulesVersion} ／ 閾値の版 {diagnosis.thresholdsVersion}。同じデータと同じ版なら、同じ項目が発火します。
      </p>
    </Card>
  );
}

/* ───────────── 1. まず手を付けるところ ───────────── */

function TopIssues({ issues }: { issues: TriggeredRule[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (issues.length === 0) return null;

  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[13px] font-bold">まず手を付けるところ</h3>
      <ol className="space-y-2">
        {issues.map((rule, i) => (
          <li key={rule.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-brand">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium">{rule.name}</span>
                  <Badge tone={TONE[rule.severity]} icon={false}>
                    {RULE_SEVERITY_LABELS[rule.severity]}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted">{rule.evidence[0]}</p>
                {rule.recommendedActions[0] && (
                  <p className="mt-1.5 text-[12px]">
                    <span className="text-muted">最初の一歩: </span>
                    {rule.recommendedActions[0]}
                  </p>
                )}
                <button type="button" className="mt-1.5 text-[11px] text-accent underline no-print" onClick={() => setOpen(open === rule.id ? null : rule.id)}>
                  {open === rule.id ? "閉じる" : "根拠と原因候補を見る"}
                </button>
              </div>
            </div>
            <div className={open === rule.id ? "mt-2 border-t border-line pt-2 text-[12px]" : "hidden print-expand border-t border-line pt-2 text-[12px]"}>
              <Detail rule={rule} />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-muted">上から順に効果が大きい見込みです（重要度 × 影響の大きさ × 確からしさ ÷ 手間 で並べています）。具体的な打ち手は「改善案」のカードにもあります。</p>
    </section>
  );
}

function EmptyNotice({ reason }: { reason: "no-data" | "no-issues" }) {
  return (
    <div className="mb-5 rounded-lg border border-line bg-surface p-3 text-[13px]">
      {reason === "no-data" ? (
        <>
          <p className="font-medium">まだ診断できていません</p>
          <p className="mt-1 text-[12px] text-muted">Search Console や GA4 とつながっていないため、数字からの判定ができていません。下の「つなぐと分かること」を見てください。</p>
        </>
      ) : (
        <>
          <p className="font-medium">数字の面で、目立った問題は見つかりませんでした</p>
          <p className="mt-1 text-[12px] text-muted">
            発火した判定項目はありません。ただし「問題が無い」と「判定できていない」は違います。下の「つなぐと分かること」で、まだ見られていない範囲を確認してください。
          </p>
        </>
      )}
    </div>
  );
}

/* ───────────── 2. 訪問後の流れ ───────────── */

function Funnel({ ga4 }: { ga4: Ga4Summary }) {
  const funnel: FunnelView = buildFunnel(ga4);
  const max = Math.max(1, ga4.sessions);

  return (
    <section className="mb-5 rounded-lg border border-line p-3">
      <h3 className="text-[13px] font-bold">
        訪問したあと、どこで止まっているか
        <span className="ml-2 text-[11px] font-normal text-muted">
          GA4 / {ga4.range.startDate}〜{ga4.range.endDate}
        </span>
      </h3>

      {funnel.worst ? (
        <p className="mt-1.5 text-[12px]">
          <span className="font-medium">
            いちばん落ちているのは「{funnel.worst.from} → {funnel.worst.to}」
          </span>
          <span className="text-muted">
            （通過 {pct(funnel.worst.rate, 1)}。この段階の目安は {pct(funnel.worst.reference, 0)} 前後）
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-muted">計測できている段階は、いずれも目安を下回っていません。</p>
      )}

      <ul className="mt-2 space-y-1.5">
        {funnel.steps.map((step) => (
          <li key={step.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span>{step.label}</span>
                {step.rate !== null && step.value !== null && (
                  // 目安を下回った段階だけ色を変える。どこが足りないかを一目で分かるように
                  <span className={`text-[11px] ${step.reference !== null && step.rate < step.reference ? "text-warn" : "text-muted"}`}>
                    {step.rateLabel} {pct(step.rate, 1)}
                    {step.reference !== null && `（目安 ${pct(step.reference, 0)}${step.rate < step.reference ? " に届いていません" : ""}）`}
                  </span>
                )}
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                {/* 件数が少ない段階でもバーが見えるように、最低幅を残す（0 件のときだけ描かない） */}
                {step.value !== null && step.value > 0 && (
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(1.5, (step.value / max) * 100))}%` }} />
                )}
              </div>
            </div>
            <span className={`tabular-nums ${step.value === null ? "text-muted" : ""}`}>{step.value === null ? "未計測" : num(step.value)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 space-y-1 text-[11px] text-muted">
        <p>数はすべてセッション（訪問）単位です。1 人が同じボタンを 3 回押しても 1 と数えます。</p>
        {funnel.hasUnmeasured && <p>「未計測」は 0 件という意味ではありません。その行動を GA4 で計測していないため、数えられていない状態です。</p>}
        <p>目安は業種によって変わります。絶対的な基準ではなく、どの段階から見るかを決めるための当たりとして使ってください。</p>
        {ga4.mappingLines.length > 0 && <p>何をどう数えたか: {ga4.mappingLines.join("／")}</p>}
        {ga4.organicConversionRate !== null && <p>自然検索からの問い合わせ率: {pct(ga4.organicConversionRate, 2)}（自然検索 {num(ga4.organicSessions)} セッション）</p>}
      </div>
    </section>
  );
}

/* ───────────── 母数 ───────────── */

function Totals({ summary, period }: { summary: NonNullable<DiagnosisResult["summary"]>; period: DiagnosisResult["period"] }) {
  return (
    <section className="mb-5 grid gap-2 rounded-lg border border-line bg-surface p-3 text-[12px] @xl:grid-cols-2">
      <div className="@xl:col-span-2 text-[11px] text-muted">
        Search Console / {period.current?.startDate}〜{period.current?.endDate}（{period.daysCurrent} 日）と、その前の {period.daysPrevious} 日を比べています
      </div>
      <div>
        <span className="text-muted">クリック: </span>
        {num(summary.totals.current.clicks)}（前期比 {signed(summary.clicksChangeRate)}）
      </div>
      <div>
        <span className="text-muted">表示回数: </span>
        {num(summary.totals.current.impressions)}（前期比 {signed(summary.impressionsChangeRate)}）
      </div>
      <div>
        <span className="text-muted">平均掲載順位: </span>
        {summary.totals.current.position.toFixed(1)}（前期 {summary.totals.previous.position.toFixed(1)}）
      </div>
      <div>
        <span className="text-muted">指名検索の割合: </span>
        {pct(summary.brandClickShare, 0)}
      </div>
      <div className="@xl:col-span-2 text-[11px] text-muted">
        指名検索の割合とクエリ取得率（{pct(summary.queryCoverage, 0)}）は、Search Console が一覧に出しているクエリの中での比率です。Google は少数のクエリを匿名化して一覧から外すため、サイト全体の比率ではありません。
      </div>
    </section>
  );
}

/* ───────────── 3. その他の項目 ───────────── */

function RuleList({ important, minor }: { important: TriggeredRule[]; minor: TriggeredRule[] }) {
  const [showMinor, setShowMinor] = useState(false);
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[13px] font-bold">そのほかに見つかったこと</h3>
      {important.length > 0 && (
        <ul className="space-y-2">
          {important.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </ul>
      )}
      {minor.length > 0 && (
        <>
          <button
            type="button"
            className="mt-2 text-[12px] text-accent underline no-print"
            onClick={() => setShowMinor(!showMinor)}
            aria-expanded={showMinor}
          >
            {showMinor ? "急ぎでない項目を閉じる" : `急ぎでない項目も見る（${minor.length} 件）`}
          </button>
          <ul className={showMinor ? "mt-2 space-y-2" : "hidden print-expand mt-2 space-y-2"}>
            {minor.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function RuleRow({ rule }: { rule: TriggeredRule }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-line">
      <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Badge tone={TONE[rule.severity]} icon={false}>
          {RULE_SEVERITY_LABELS[rule.severity]}
        </Badge>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">{rule.name}</span>
          <span className="mt-0.5 block text-[12px] text-muted">{rule.evidence[0]}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted no-print">{open ? "閉じる" : "詳しく"}</span>
      </button>
      <div className={open ? "border-t border-line p-3 text-[12px]" : "hidden print-expand border-t border-line p-3 text-[12px]"}>
        <Detail rule={rule} />
      </div>
    </li>
  );
}

function Detail({ rule }: { rule: TriggeredRule }) {
  return (
    <dl className="grid gap-2 @xl:grid-cols-2">
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
      <Row label="原因の候補（どれか 1 つとは限りません）">
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
      <Row label={`打ち手（手間の目安: ${EFFORT_LABELS[rule.effort]}）`} wide>
        <ul className="space-y-0.5">
          {rule.recommendedActions.map((a) => (
            <li key={a}>・{a}</li>
          ))}
        </ul>
      </Row>
      {rule.prohibitedConclusions.length > 0 && (
        <Row label="この数字だけでは言えないこと" wide>
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
      <Row label="この判定について" wide>
        <span className="text-muted">
          {RULE_CATEGORY_LABELS[rule.category]}／確からしさ: {CONFIDENCE_LABELS[rule.confidence]}／判定 ID: {rule.id}
        </span>
      </Row>
    </dl>
  );
}

/** 判定していない理由。画面では折りたたみ、PDF では開いた状態で出す */
function Limitations({ items }: { items: readonly string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button type="button" className="text-[11px] text-muted underline no-print" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "閉じる" : `判定していない項目の詳しい理由（${items.length} 件）`}
      </button>
      <ul className={`space-y-0.5 text-[11px] text-muted ${open ? "mt-1" : "hidden print-expand mt-1"}`}>
        {items.map((l) => (
          <li key={l}>・{l}</li>
        ))}
      </ul>
    </div>
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

/* ───────────── 4. 判定していないこと → 次の一手 ───────────── */

function NextSteps({ diagnosis }: { diagnosis: DiagnosisResult }) {
  const steps = nextSteps(diagnosis, diagnosis.ga4);
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h3 className="text-[13px] font-bold">つなぐと分かること</h3>
      <p className="mt-0.5 text-[11px] text-muted">いま見られていない範囲です。「問題が無い」のではなく「まだ見ていない」だけなので、ここを埋めると診断が深くなります。</p>
      <ul className="mt-2 space-y-2">
        {steps.map((step) => (
          <li key={step.action} className="text-[12px]">
            <div className="font-medium">
              {step.action}
              {step.count > 0 && <span className="ml-1 font-normal text-muted">（判定項目が {step.count} 件増えます）</span>}
            </div>
            <div className="text-muted">{step.unlocks}</div>
            {step.href && (
              <ButtonLink href={step.href} size="sm" variant="ghost" className="mt-1 no-print">
                設定画面を開く
              </ButtonLink>
            )}
          </li>
        ))}
      </ul>
      {diagnosis.limitations.length > 0 && (
        <Limitations items={diagnosis.limitations} />
      )}
    </section>
  );
}
