"use client";

/**
 * ページ改善。**1 回の操作で「競合と比べた事実」と「改善案」を同じページに出す**
 * （利用者の指示 2026-09-22「競合と比べたら改善案はそのページで提示すればよくない？」）。
 *
 * それまでは 2 つのタブに分かれていて、しかも**改修案タブは競合の情報を見ていなかった**。
 * 上位と比べて何が足りないかを出したのに、改修案はそれを使っていない状態だったので、
 * 1 本の流れにまとめ、競合との差を改修案の根拠として渡すようにした。
 *
 * 流れ（ボタンは 1 つ）:
 *   1. `/api/page-diagnosis` … 上位 10 件を取得し、各ページと自社ページを測って比べる（事実）
 *   2. `/api/improvement` … その差を根拠に、そのまま貼れる改修案を作る（**最大 5 件**）
 *
 * 出すものは端的に。細かい所見（alt が 1 枚無い、など）は「詳しく見る」の中に置き、
 * 表には出さない（利用者の指示「細かい修正指示は負担が大きいからいらない」）。
 */
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ContentTab } from "@/components/page-diagnosis/ContentTab";
import { IssuesTab } from "@/components/page-diagnosis/IssuesTab";
import { SerpTab } from "@/components/page-diagnosis/SerpTab";
import { PageTargetField, SiteTargetNotice, useRegisteredSite } from "@/components/site/RegisteredSite";
import { Badge, Button, Callout, Card, EmptyState, Field, InlineDiff, Input, Select } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";
import type { ImprovementResult } from "@/lib/improvement/generate";
import { AREA_LABELS, EFFORT_LABELS, PRIORITY_LABELS, type Proposal } from "@/lib/improvement/schema";
import {
  findDiagnosis,
  pageDiagnosesStore,
  pageDiagnosisSettingsStore,
  saveDiagnosis,
  type StoredDiagnosis,
} from "@/lib/page-diagnosis/store";
import { formatStat, STAT_METRICS } from "@/lib/page-diagnosis/stats";
import type { DiagnosisResult } from "@/lib/page-diagnosis/types";
import { DEVICE_LABELS, rankKeywordsStore } from "@/lib/rank/store";
import { resolvePageUrl } from "@/lib/site/target";
import { useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";

const PRIORITY_TONE: Record<Proposal["priority"], BadgeTone> = { high: "fail", medium: "warn", low: "info" };

interface DiagnosisResponse {
  result: DiagnosisResult;
  cached?: boolean;
}

/** 改修案の取得。診断と違って「プランが足りない」を通常の結果として扱う */
type ImproveState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "denied"; message: string }
  | { phase: "error"; message: string }
  | { phase: "done"; result: ImprovementResult };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

/** 診断結果 → 改修案に渡す「上位との差」。長い文章はここで切る */
function serpContextOf(d: DiagnosisResult | StoredDiagnosis) {
  const stats = STAT_METRICS.map((m) => {
    const s = d.stats[m.key];
    return `${m.label}: 上位 10 件の中央値 ${formatStat(s.median, m.unit)} / 自社 ${formatStat(s.self, m.unit)}`;
  });
  const gaps = (d.analysis?.content_proposals ?? []).slice(0, 8).map((p) => `${p.outline}（${p.reason}）`.slice(0, 300));
  return {
    source: d.serpSource,
    ...(d.analysis?.search_intent ? { searchIntent: d.analysis.search_intent.slice(0, 600) } : {}),
    ...(d.analysis?.serp_trend ? { serpTrend: d.analysis.serp_trend.slice(0, 600) } : {}),
    stats,
    ...(gaps.length > 0 ? { gaps } : {}),
  };
}

export function PageImproveTool() {
  const id = useId();
  const { status } = useIntegrations();
  const serpEnabled = status?.serpapi === true;
  const anthropicEnabled = status?.anthropic === true;
  // どちらか 1 つあれば上位 10 件は取れる（無い方は推定に回る）
  const canRun = serpEnabled || anthropicEnabled;

  const site = useRegisteredSite();
  const [settings, setSettings] = useStore(pageDiagnosisSettingsStore);
  const [diagnoses] = useStore(pageDiagnosesStore);
  const [rankKeywords] = useStore(rankKeywordsStore);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [improve, setImprove] = useState<ImproveState>({ phase: "idle" });
  const { state, run, cancel } = useToolRun<DiagnosisResponse>();

  const selected = useMemo(() => {
    const found = selectedId ? findDiagnosis(diagnoses, selectedId) : null;
    return found ?? diagnoses[0] ?? null;
  }, [diagnoses, selectedId]);

  const keywordSuggestions = useMemo(() => {
    const set = new Set<string>(rankKeywords.map((k) => k.keyword).filter(Boolean));
    return Array.from(set).slice(0, 50);
  }, [rankKeywords]);

  const keyword = settings.keyword.trim();
  const running = state.phase === "running" || improve.phase === "running";

  /** 改修案だけを作り直す（診断はそのまま使う） */
  async function makeProposals(diagnosis: DiagnosisResult | StoredDiagnosis, refresh = false) {
    const url = diagnosis.targetUrl;
    if (!url) {
      setImprove({
        phase: "error",
        message: "対象ページが決まらなかったため、改善案は作れません（検索結果に自社ドメインが見つかりませんでした）。",
      });
      return;
    }
    setImprove({ phase: "running" });
    try {
      const res = await fetch("/api/improvement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, keyword: diagnosis.keyword, serp: serpContextOf(diagnosis), refresh }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setImprove({ phase: "denied", message: body.error ?? "この機能は上位のプランでご利用いただけます。" });
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `改善案を作れませんでした（HTTP ${res.status}）`);
      setImprove({ phase: "done", result: body.result as ImprovementResult });
    } catch (err) {
      setImprove({ phase: "error", message: err instanceof Error ? err.message : "改善案を作れませんでした" });
    }
  }

  /** ボタン 1 つ: 競合と比べる → そのまま改善案まで */
  async function execute() {
    if (!keyword || !canRun) return;
    setImprove({ phase: "idle" });
    const data = await run("/api/page-diagnosis", {
      keyword,
      ...(settings.page.trim() ? { url: resolvePageUrl(site.siteUrl, settings.page) ?? settings.page.trim() } : {}),
      device: settings.device,
      ...(settings.location.trim() ? { location: settings.location.trim() } : {}),
      ...(site.domain ? { projectDomain: site.domain } : {}),
    });
    if (!data) return;
    saveDiagnosis(data.result);
    setSelectedId(data.result.id);
    await makeProposals(data.result);
  }

  return (
    <div className="space-y-6">
      {!canRun && (
        <Callout tone="info" title="外部連携が未設定のため実行できません">
          SERPAPI_KEY があれば検索順位を実測し、ANTHROPIC_API_KEY があれば Claude の Web 検索で上位ページを推定します。
          どちらか 1 つを
          <Link href="/settings" className="mx-1 font-bold text-accent underline-offset-2 hover:underline">
            設定
          </Link>
          すると実行できます。
        </Callout>
      )}

      <Card
        title="対策キーワードを入れて実行する"
        description="上位 10 件と自社ページを比べ、その差を根拠にした改善案までを一度に出します。ページを省略すると、検索結果の中で自社ドメインの最上位ページを対象にします。"
        className="no-print"
      >
        <SiteTargetNotice what="ページ改善" className="mb-4" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="対策キーワード" htmlFor={`${id}-keyword`} required hint="例: AIO 対策 とは">
            <Input
              id={`${id}-keyword`}
              list={`${id}-keyword-list`}
              value={settings.keyword}
              placeholder="対策キーワード"
              onChange={(e) => setSettings({ ...settings, keyword: e.target.value })}
              disabled={running}
            />
            <datalist id={`${id}-keyword-list`}>
              {keywordSuggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>

          <PageTargetField
            id={`${id}-page`}
            label="対象ページ（任意）"
            value={settings.page}
            onChange={(page) => setSettings({ ...settings, page })}
            disabled={running}
            emptyHint={`空欄にすると ${site.domain} の中で検索順位が最も高いページを自動で選びます`}
          />

          <Field label="デバイス" htmlFor={`${id}-device`}>
            <Select
              id={`${id}-device`}
              value={settings.device}
              onChange={(e) => setSettings({ ...settings, device: e.target.value as "desktop" | "mobile" })}
              disabled={running}
            >
              {(["desktop", "mobile"] as const).map((d) => (
                <option key={d} value={d}>
                  {DEVICE_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="地域（任意）" htmlFor={`${id}-location`} hint="例: Tokyo, Japan（SERPAPI_KEY があるときのみ有効）">
            <Input
              id={`${id}-location`}
              value={settings.location}
              placeholder="Tokyo, Japan"
              onChange={(e) => setSettings({ ...settings, location: e.target.value })}
              disabled={running || !serpEnabled}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void execute()} loading={running} disabled={!canRun || keyword.length === 0}>
            競合と比べて改善案を作る
          </Button>
          {state.phase === "running" && (
            <Button variant="secondary" onClick={cancel}>
              中止
            </Button>
          )}
          <p className="text-[12px] text-muted">
            {state.phase === "running"
              ? "上位 10 件と自社ページを取得して比べています（1 分ほど）…"
              : improve.phase === "running"
                ? "比較の結果をもとに改善案を作っています…"
                : "上位 10 件を取得 → 各ページを測って比較 → その差を根拠に改善案（最大 5 件）。2 分ほどかかります。"}
          </p>
        </div>

        {state.phase === "error" && (
          <Callout tone="fail" className="mt-4">
            {state.message}
          </Callout>
        )}
      </Card>

      {!selected && !running && <EmptyState title="まだ結果がありません" description="対策キーワードを入れて実行すると、上位 10 件との比較と改善案がここに出ます。" />}

      {selected && (
        <>
          <FactsCard diagnosis={selected} />
          <ProposalsCard
            state={improve}
            onRetry={() => void makeProposals(selected, true)}
            disabled={running}
            hasTarget={Boolean(selected.targetUrl)}
          />
          <DetailsBlock diagnosis={selected} chatEnabled={anthropicEnabled} />
          {diagnoses.length > 1 && (
            <Card title="過去の結果" description="このブラウザに最新 20 件まで残ります。" className="no-print">
              <ul className="divide-y divide-line">
                {diagnoses.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(d.id);
                        setImprove({ phase: "idle" });
                      }}
                      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <span className={`text-[13px] ${selected.id === d.id ? "font-bold text-accent" : "text-ink"}`}>{d.keyword}</span>
                      <span className="ml-2 break-all text-[12px] text-muted">{d.targetUrl ?? "対象ページなし"}</span>
                      <span className="ml-2 text-[11px] text-muted">{formatDateTime(d.createdAt)}</span>
                    </button>
                    {selected.id === d.id && improve.phase === "idle" && d.targetUrl && (
                      <Button variant="ghost" size="sm" onClick={() => void makeProposals(d)} disabled={running}>
                        この結果で改善案を作る
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** ①事実: 上位 10 件と比べて、いまどうなっているか */
function FactsCard({ diagnosis }: { diagnosis: StoredDiagnosis }) {
  const a = diagnosis.analysis;
  return (
    <Card
      title="上位 10 件と比べた結果（事実）"
      description="検索結果の上位ページと自社ページを実際に取得して測った値です。"
      printCard
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <span className="font-bold text-ink">{diagnosis.keyword}</span>
        <span className="break-all">{diagnosis.targetUrl ?? "対象ページなし"}</span>
        <span>{DEVICE_LABELS[diagnosis.device]}</span>
        <span>{formatDateTime(diagnosis.createdAt)}</span>
        {diagnosis.serpSource === "web_search" && <Badge tone="warn">順位は推定</Badge>}
      </div>

      {a && (a.search_intent || a.serp_trend) && (
        <dl className="mt-4 space-y-3">
          {a.search_intent && (
            <div>
              <dt className="text-[12px] font-bold text-muted">この語で検索する人が求めているもの</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-ink">{a.search_intent}</dd>
            </div>
          )}
          {a.serp_trend && (
            <div>
              <dt className="text-[12px] font-bold text-muted">上位ページの傾向</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-ink">{a.serp_trend}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="py-2 pr-3 font-bold">測ったもの</th>
              <th className="py-2 pr-3 font-bold">上位 10 件の中央値</th>
              <th className="py-2 pr-3 font-bold">自社</th>
              <th className="py-2 font-bold">差</th>
            </tr>
          </thead>
          <tbody>
            {STAT_METRICS.map((m) => {
              const s = diagnosis.stats[m.key];
              const gap = s.gap;
              const behind = gap !== null && (m.moreIsBetter ? gap < 0 : gap > 0);
              return (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 text-ink">{m.label}</td>
                  <td className="py-2 pr-3 text-muted">{formatStat(s.median, m.unit)}</td>
                  <td className="py-2 pr-3 text-ink">{formatStat(s.self, m.unit)}</td>
                  <td className={`py-2 ${behind ? "font-bold text-fail" : "text-muted"}`}>{formatStat(gap, m.unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {diagnosis.notes.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          {diagnosis.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** ②改善案: 上の事実を根拠に、そのまま貼れる形で（最大 5 件） */
function ProposalsCard({
  state,
  onRetry,
  disabled,
  hasTarget,
}: {
  state: ImproveState;
  onRetry: () => void;
  disabled: boolean;
  hasTarget: boolean;
}) {
  if (state.phase === "running") {
    return (
      <Card title="改善案" className="no-print">
        <p className="text-[13px] text-muted">比較の結果をもとに作成中です…</p>
      </Card>
    );
  }
  if (state.phase === "denied") {
    return (
      <Card title="改善案">
        <Callout tone="info" title="改善案の作成はスタンダード以上の機能です">
          <p>{state.message}</p>
          <p className="mt-2">
            <Link href="/plans" className="font-bold text-accent underline underline-offset-2">
              プランの内容を見る
            </Link>
          </p>
        </Callout>
      </Card>
    );
  }
  if (state.phase === "error") {
    return (
      <Card title="改善案" className="no-print">
        <Callout tone="fail">{state.message}</Callout>
        {hasTarget && (
          <Button variant="secondary" className="mt-3" onClick={onRetry} disabled={disabled}>
            もう一度作る
          </Button>
        )}
      </Card>
    );
  }
  if (state.phase === "idle") {
    return (
      <Card title="改善案" className="no-print">
        <p className="text-[13px] text-muted">
          {hasTarget ? "この結果から改善案を作れます。" : "対象ページが決まらなかったため、改善案は作れません。"}
        </p>
        {hasTarget && (
          <Button className="mt-3" onClick={onRetry} disabled={disabled}>
            改善案を作る
          </Button>
        )}
      </Card>
    );
  }

  const { plan, report } = state.result;
  return (
    <Card
      title={`改善案（${plan.proposals.length} 件）`}
      description="上の比較と、このページの機械的な診断を根拠にした改修案です。直せば効くものだけに絞っています。反映はお客様・運用者の作業です。"
      printCard
      actions={
        <Button variant="ghost" size="sm" onClick={onRetry} disabled={disabled}>
          作り直す
        </Button>
      }
    >
      <p className="text-[12px] text-muted">
        <span className="break-all">{state.result.finalUrl}</span> ／ このページの採点 {report.score} 点（{report.scoreLabel}）
      </p>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
        {plan.summary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <ol className="mt-5 space-y-4">
        {plan.proposals.map((p, i) => (
          <li key={i} className="rounded-sm border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PRIORITY_TONE[p.priority]}>優先度 {PRIORITY_LABELS[p.priority]}</Badge>
              <Badge>{AREA_LABELS[p.area]}</Badge>
              <Badge>手間 {EFFORT_LABELS[p.effort]}</Badge>
              <span className="text-[14px] font-bold text-ink">{p.headline}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.why}</p>
            <div className="mt-3">
              <InlineDiff before={p.before} after={p.after} />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">期待できること: {p.impact}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** ③詳細: 細かい所見は畳んでおく（普段は運用者しか見ない） */
function DetailsBlock({ diagnosis, chatEnabled }: { diagnosis: StoredDiagnosis; chatEnabled: boolean }) {
  return (
    <details className="no-print rounded-sm border border-line bg-panel p-4">
      <summary className="cursor-pointer text-[13px] font-bold text-ink">
        詳しく見る（上位 10 件の一覧・細かい所見・追加すべき内容・AI への質問）
      </summary>
      <div className="mt-4 space-y-6">
        <SerpTab diagnosis={diagnosis} />
        <IssuesTab diagnosis={diagnosis} />
        <ContentTab diagnosis={diagnosis} chatEnabled={chatEnabled} />
      </div>
    </details>
  );
}
