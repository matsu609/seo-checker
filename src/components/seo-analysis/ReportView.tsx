"use client";

/**
 * 精密診断の報告書。
 * 上から: KPI → 結論と現状分析 → 改善案 → 強み・弱み → コンサルの視点 → セカンドオピニオン → 速度 → 付録。
 * すべての主張に事実 ID のチップが付く。
 */
import { useMemo, useRef, useState } from "react";
import { AuditCategoryTable } from "@/components/site-audit/AuditCategoryTable";
import { AuditIssues, type IssueRow } from "@/components/site-audit/AuditIssues";
import { AuditPages } from "@/components/site-audit/AuditPages";
import type { AuditResult } from "@/lib/audit/types";
import { DiagnosisCard } from "./DiagnosisCard";
import { DomainPowerCard } from "./DomainPowerCard";
import { LlmsTxtCard } from "./LlmsTxtCard";
import { StructureCard } from "./StructureCard";
import { TrustCard } from "./TrustCard";
import { Sparkline } from "@/components/charts";
import { Badge, Button, Callout, Card, StatCard } from "@/components/ui";
import { CRUX_METRIC_LABELS, CRUX_STATUS_LABELS, type CruxMetricId } from "@/lib/crux/types";
import { formatCrux } from "@/lib/crux/parse";
import { GRADE_LABELS } from "@/lib/domain-power/types";
import { downloadPdf } from "@/lib/pdf/download";
import type { AnalysisRecord, SecondOpinionRecord } from "@/lib/seo-analysis/ai/schema";
import { GOAL_LABELS, type Fact, type SeoFactSheet } from "@/lib/seo-analysis/sheet/types";
import { fmt, formatDateTime, hostOf } from "@/lib/report";
import { FactChips, FactsAppendix } from "./FactsAppendix";

const EFFORT_LABELS = { low: "小", medium: "中", high: "大" } as const;
const PRIORITY_TONE = { 1: "fail", 2: "warn", 3: "info" } as const;

export interface ReportViewProps {
  sheet: SeoFactSheet;
  /** サイト診断の全結果（課題一覧・ページ一覧）。古い保存分は null */
  audit: AuditResult | null;
  analysis: AnalysisRecord | null;
  secondOpinion: SecondOpinionRecord | null;
  /** AI 分析が動いている（結果待ち） */
  analyzing: boolean;
  secondOpinionState: "idle" | "loading" | "disabled" | "done" | "error";
  errors: { analysis: string | null; secondOpinion: string | null };
  onReanalyze?: () => void;
  onSecondOpinion?: () => void;
  analysisCount: number;
  maxAnalyses: number;
}

export function ReportView(props: ReportViewProps) {
  const { sheet, audit, analysis, secondOpinion } = props;
  const [showDetail, setShowDetail] = useState(false);
  const factMap = useMemo(() => new Map(sheet.facts.map((f) => [f.id, f] as [string, Fact])), [sheet.facts]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const a = analysis?.analysis ?? null;
  const cwv = sheet.speed.crux.origin;
  const site = sheet.site;
  const issueTotal = site.bySeverity.error + site.bySeverity.warning + site.bySeverity.info;
  const rankedKeywords = sheet.search.keywords.filter((k) => k.rank !== null).length;
  const domain = sheet.domain ?? null;
  const llms = sheet.llms ?? null;

  async function toPdf() {
    if (!sheetRef.current) return;
    setPdfBusy(true);
    try {
      await downloadPdf({ element: sheetRef.current, fileName: `精密診断_${hostOf(site.origin)}_${sheet.generatedAt.slice(0, 10)}` });
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-[12px] text-muted">
          収集 {formatDateTime(sheet.generatedAt)} ／ 目的: {GOAL_LABELS[sheet.input.goal]}
          {sheet.input.keywords.length > 0 && ` ／ キーワード: ${sheet.input.keywords.join(" / ")}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {props.onReanalyze && (
            <Button variant="secondary" size="sm" loading={props.analyzing} disabled={props.analysisCount >= props.maxAnalyses} onClick={props.onReanalyze}>
              AI 分析をやり直す（{props.analysisCount} / {props.maxAnalyses}）
            </Button>
          )}
          <Button variant="secondary" size="sm" loading={pdfBusy} disabled={!a} onClick={() => void toPdf()}>
            PDF をダウンロード
          </Button>
        </div>
      </div>

      <div ref={sheetRef} className="space-y-6">
        <div className={`grid gap-3 ${domain ? "@2xl:grid-cols-5" : "@2xl:grid-cols-4"}`}>
          <StatCard label="対象サイト" value={<span className="text-base break-all">{hostOf(site.origin)}</span>} hint={`${fmt(site.crawl.analyzed)} ページを診断`} />
          <StatCard label="検出した課題" value={fmt(issueTotal)} unit="件" hint={`重大 ${site.bySeverity.error} / 警告 ${site.bySeverity.warning} / 情報 ${site.bySeverity.info}`} />
          <StatCard
            label="実ユーザーの速度（Core Web Vitals）"
            value={cwv ? (cwv.passesCoreWebVitals === null ? "判定不能" : cwv.passesCoreWebVitals ? "合格" : "不合格") : "データなし"}
            hint={cwv?.metrics.lcp ? `LCP ${formatCrux("lcp", cwv.metrics.lcp.p75)}（${CRUX_STATUS_LABELS[cwv.metrics.lcp.status]}）` : sheet.coverage.crux ? "サイト全体のデータ不足" : "CrUX 未取得"}
          />
          <StatCard
            label="対策キーワードの順位"
            value={sheet.search.keywords.length > 0 ? `${rankedKeywords} / ${sheet.search.keywords.length}` : "—"}
            unit={sheet.search.keywords.length > 0 ? "語が 100 位以内" : undefined}
            hint={sheet.coverage.serp ? (sheet.search.brand ? `ブランド名検索: ${sheet.search.brand.rank === null ? "圏外" : `${sheet.search.brand.rank} 位`}` : "") : "検索順位は未取得（SerpApi）"}
          />
          {domain && (
            <StatCard
              label="ドメインパワー（推定）"
              value={domain.score === null ? "判定できず" : domain.score}
              unit={domain.score === null ? undefined : "/ 100"}
              hint={[domain.score === null ? `採点できた配点 ${domain.measuredMax} / 100` : `${domain.grade ? GRADE_LABELS[domain.grade] : ""}（採点できた配点 ${domain.measuredMax} / 100）`, domain.ahrefsDr === null ? null : `Ahrefs DR ${domain.ahrefsDr.toFixed(0)}`].filter(Boolean).join(" ／ ")}
            />
          )}
        </div>

        {props.errors.analysis && (
          <Callout tone="fail" title="AI 分析に失敗しました">
            {props.errors.analysis}
          </Callout>
        )}

        {props.analyzing && !a && (
          <Card title="AI が分析しています">
            <p className="text-sm text-muted">事実シート（{sheet.facts.length} 行）を読んで、現状分析と改善案を書いています。1〜3 分かかります。</p>
          </Card>
        )}

        {a && (
          <>
            <Card title="結論と現状分析" printCard>
              <p className="text-base font-bold leading-relaxed text-ink">{a.headline}</p>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink">
                {a.situation.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              {analysis && analysis.unverifiedNumbers.length > 0 && (
                <Callout tone="warn" className="mt-4">
                  本文中の次の数値は事実シートに見つかりませんでした: {analysis.unverifiedNumbers.join(", ")}。単位換算や丸めの可能性がありますが、付録で確かめてください。
                </Callout>
              )}
              <p className="mt-4 text-[11px] text-muted">
                生成: {analysis?.model} ／ {analysis ? formatDateTime(analysis.generatedAt) : ""}。AI は事実シートの数字だけを根拠にしています。
              </p>
            </Card>

            <Card title="改善案（優先順）" description="優先度 1 = 今すぐ・効果が大きい。手間は担当者の作業量の目安。ID は付録の事実シートの行です。" printCard>
              <ol className="space-y-4">
                {[...a.recommendations]
                  .sort((x, y) => x.priority - y.priority)
                  .map((r, i) => (
                    <li key={i} className="border-l-2 border-line pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={PRIORITY_TONE[r.priority as 1 | 2 | 3]} icon={false}>
                          優先度 {r.priority}
                        </Badge>
                        <Badge tone="neutral" icon={false}>
                          手間 {EFFORT_LABELS[r.effort]}
                        </Badge>
                        <span className="text-sm font-bold text-ink">{r.title}</span>
                      </div>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-[13px] leading-relaxed @xl:grid-cols-[6rem_1fr]">
                        <dt className="text-muted">何をどう変える</dt>
                        <dd className="text-ink">{r.what}</dd>
                        <dt className="text-muted">なぜ</dt>
                        <dd className="text-ink">
                          {r.why} <FactChips ids={r.factIds} facts={factMap} className="ml-1 align-middle" />
                        </dd>
                        <dt className="text-muted">期待できること</dt>
                        <dd className="text-ink">{r.expected}</dd>
                        {(r.before || r.after) && (
                          <>
                            <dt className="text-muted">書き換え案</dt>
                            <dd className="text-ink">
                              {r.before && <span className="block text-muted line-through decoration-fail">{r.before}</span>}
                              {r.after && <span className="block font-bold">{r.after}</span>}
                            </dd>
                          </>
                        )}
                      </dl>
                    </li>
                  ))}
              </ol>
            </Card>

            <div className="grid gap-6 @3xl:grid-cols-2">
              <Card title="強み" headingLevel={2} printCard>
                <ul className="space-y-2 text-[13px] leading-relaxed text-ink">
                  {a.strengths.length === 0 && <li className="text-muted">数字から言える強みは挙がりませんでした。</li>}
                  {a.strengths.map((s, i) => (
                    <li key={i} className="border-l-2 border-pass pl-3">
                      {s.text} <FactChips ids={s.factIds} facts={factMap} className="ml-1 align-middle" />
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="弱み" headingLevel={2} printCard>
                <ul className="space-y-2 text-[13px] leading-relaxed text-ink">
                  {a.weaknesses.map((w, i) => (
                    <li key={i} className="border-l-2 border-fail pl-3">
                      {w.text} <FactChips ids={w.factIds} facts={factMap} className="ml-1 align-middle" />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card title="コンサルタントの視点" description="左は数字を見ずに言われがちなこと、右はこのサイトの数字を見たうえで本当に言うべきこと。" printCard>
              <div className="grid gap-5 @3xl:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold text-muted">普通のコンサルが言いそうなこと</h3>
                  <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted">
                    {a.consultant.typical.map((t, i) => (
                      <li key={i} className="border-l-2 border-line pl-3">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">数字を見て本当に言うべきこと</h3>
                  <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink">
                    {a.consultant.real.map((t, i) => (
                      <li key={i} className="border-l-2 border-accent pl-3">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {a.cautions.length > 0 && (
                <div className="mt-4 rounded-sm border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
                  <span className="font-bold">断定できない点: </span>
                  {a.cautions.join(" ／ ")}
                </div>
              )}
            </Card>

            <Card
              title="セカンドオピニオン（ChatGPT）"
              description="同じ事実シートと Claude の改善案を ChatGPT に渡し、食い違う点と追加の指摘だけを出しています。"
              printCard
              actions={
                props.secondOpinionState !== "disabled" && props.onSecondOpinion ? (
                  <Button variant="secondary" size="sm" loading={props.secondOpinionState === "loading"} onClick={props.onSecondOpinion} className="no-print">
                    {secondOpinion ? "取り直す" : "取得する"}
                  </Button>
                ) : null
              }
            >
              {props.secondOpinionState === "disabled" && (
                <p className="text-[13px] text-muted">
                  サーバーに <code className="font-mono">OPENAI_API_KEY</code> が無いため、セカンドオピニオンは出せません（Claude の分析だけで完成しています）。
                </p>
              )}
              {props.errors.secondOpinion && (
                <Callout tone="warn" className="mb-3">
                  {props.errors.secondOpinion}
                </Callout>
              )}
              {props.secondOpinionState === "loading" && !secondOpinion && <p className="text-[13px] text-muted">ChatGPT が読んでいます（1〜2 分）。</p>}
              {secondOpinion && (
                <div className="space-y-4 text-[13px] leading-relaxed">
                  {secondOpinion.opinion.disagreements.length > 0 ? (
                    <div>
                      <h3 className="mb-2 text-sm font-bold text-ink">食い違う点</h3>
                      <ul className="space-y-3">
                        {secondOpinion.opinion.disagreements.map((d, i) => (
                          <li key={i} className="border-l-2 border-warn pl-3">
                            <span className="font-bold text-ink">{d.topic}</span>
                            <span className="mt-1 block text-muted">Claude: {d.claude}</span>
                            <span className="block text-ink">
                              ChatGPT: {d.chatgpt} <FactChips ids={d.factIds} facts={factMap} className="ml-1 align-middle" />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-muted">結論・優先順位に食い違いはありませんでした。</p>
                  )}
                  {secondOpinion.opinion.additions.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-bold text-ink">Claude が触れていない指摘</h3>
                      <ul className="space-y-1.5">
                        {secondOpinion.opinion.additions.map((x, i) => (
                          <li key={i} className="border-l-2 border-line pl-3 text-ink">
                            {x.text} <FactChips ids={x.factIds} facts={factMap} className="ml-1 align-middle" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {secondOpinion.opinion.agreements.length > 0 && (
                    <p className="text-[12px] text-muted">同意した点: {secondOpinion.opinion.agreements.join(" ／ ")}</p>
                  )}
                  <p className="text-[11px] text-muted">
                    生成: {secondOpinion.model} ／ {formatDateTime(secondOpinion.generatedAt)}
                  </p>
                </div>
              )}
            </Card>
          </>
        )}

        {sheet.diagnosis && <DiagnosisCard diagnosis={sheet.diagnosis} />}

        {domain && <DomainPowerCard domain={domain} />}

        {llms && <LlmsTxtCard llms={llms} />}

        <SpeedCard sheet={sheet} />

        <Card
          title="詳細: サイト診断（クロールの全結果）"
          description="精密診断の中で実行したクロールの結果です。48 ルールの課題一覧（CSV 出力可）、カテゴリ別の件数、サイトの構成、信頼の手がかり、診断したページの一覧。"
          actions={
            audit ? (
              <Button variant="secondary" size="sm" className="no-print" onClick={() => setShowDetail((v) => !v)}>
                {showDetail ? "折りたたむ" : `詳細を表示（課題 ${fmt(audit.issues.length)} 件・${fmt(audit.crawl.analyzed)} ページ）`}
              </Button>
            ) : null
          }
        >
          {!audit && <p className="text-[13px] text-muted">この分析にはクロールの全結果が保存されていません（保存の列が無い時期の分析か、収集だけの状態です）。付録の事実シートに集計は残っています。</p>}
          {audit && !showDetail && (
            <p className="text-[13px] text-muted no-print">
              重大 {audit.bySeverity.error} / 警告 {audit.bySeverity.warning} / 情報 {audit.bySeverity.info}。「詳細を表示」で課題ごとの URL と直し方、ページ一覧を開きます。
            </p>
          )}
          {audit && (
            <div className={`space-y-6 ${showDetail ? "" : "hidden print-expand"}`}>
              <AuditCategoryTable rows={audit.byCategory} hasPrevious={false} />
              {audit.structure && <StructureCard structure={audit.structure} />}
              {audit.trust && <TrustCard trust={audit.trust} />}
              <AuditIssues issues={audit.issues.map((i): IssueRow => ({ ...i }))} origin={audit.origin} hasPrevious={false} />
              <AuditPages pages={audit.pages} failures={audit.failures} />
            </div>
          )}
        </Card>

        <FactsAppendix facts={sheet.facts} />
      </div>
    </div>
  );
}

function SpeedCard({ sheet }: { sheet: SeoFactSheet }) {
  const cx = sheet.speed.crux;
  const ids: CruxMetricId[] = ["lcp", "inp", "cls"];
  return (
    <Card
      title="速度: 実ユーザー（CrUX）と診断（PageSpeed）"
      description="CrUX は Chrome の実ユーザーが体験した速度（75 パーセンタイル、直近 28 日）。「本当に遅いのか」はこちらで判断します。PageSpeed は「なぜ遅いのか」の診断です。"
      printCard
    >
      {cx.origin ? (
        <div className="grid gap-3 @2xl:grid-cols-3">
          {ids.map((id) => {
            const m = cx.origin?.metrics[id];
            const history = cx.history?.metrics[id]?.map((p) => p.p75).filter((v): v is number => v !== null) ?? [];
            return (
              <div key={id} className="rounded-sm border border-line px-4 py-3">
                <div className="text-[11px] text-muted">{CRUX_METRIC_LABELS[id]}（サイト全体）</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[22px] font-bold tabular-nums text-ink">{m ? formatCrux(id, m.p75) : "—"}</span>
                  {m && <Badge tone={m.status === "good" ? "pass" : m.status === "poor" ? "fail" : "warn"}>{CRUX_STATUS_LABELS[m.status]}</Badge>}
                </div>
                {history.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline values={history} width={160} height={28} ariaLabel={`${CRUX_METRIC_LABELS[id]} の推移 ${history.length} 週`} />
                    <div className="text-[11px] text-muted">
                      過去 {history.length} 週: {formatCrux(id, history[0])} → {formatCrux(id, history[history.length - 1])}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-muted">
          {cx.originFailure === "no-data"
            ? "サイト全体の実ユーザーデータがありません（Chrome の利用者が少ないサイトでは CrUX に載りません）。PageSpeed のラボ値だけで判断します。"
            : sheet.coverage.crux
              ? "実ユーザーの速度を取得できませんでした。"
              : "実ユーザーの速度（CrUX）は取得していません。"}
        </p>
      )}

      {sheet.speed.psi.length > 0 && (
        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted">
              <th className="py-1.5 pr-2 font-normal">ページ</th>
              <th className="py-1.5 pr-2 text-right font-normal">Performance</th>
              <th className="py-1.5 pr-2 text-right font-normal">LCP（実ユーザー）</th>
              <th className="py-1.5 pr-2 text-right font-normal">INP</th>
              <th className="py-1.5 pr-2 text-right font-normal">CLS</th>
              <th className="py-1.5 font-normal">主な改善余地</th>
            </tr>
          </thead>
          <tbody>
            {sheet.speed.psi.map((p) => {
              const u = cx.urls.find((x) => x.url === p.url);
              const rec = u?.record?.scope === "url" ? u.record : null;
              const cell = (id: CruxMetricId) => {
                const m = rec?.metrics[id] ?? null;
                if (m) return `${formatCrux(id, m.p75)}（${CRUX_STATUS_LABELS[m.status]}）`;
                const psiCrux = p.result?.crux?.[id as "lcp" | "inp" | "cls"];
                if (psiCrux) return id === "cls" ? psiCrux.value.toFixed(2) : `${(psiCrux.value / 1000).toFixed(1)} 秒`;
                return "データ不足";
              };
              return (
                <tr key={p.url} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
                      {p.label}
                    </a>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{p.result?.categories.performance ?? (p.error ? "取得できず" : "—")}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{cell("lcp")}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{cell("inp")}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{cell("cls")}</td>
                  <td className="py-1.5 text-muted">{p.result?.opportunities.slice(0, 3).map((o) => o.title).join(" / ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {sheet.speed.notes.length > 0 && <p className="mt-3 text-[11px] text-muted">{sheet.speed.notes.join(" ／ ")}</p>}
    </Card>
  );
}
