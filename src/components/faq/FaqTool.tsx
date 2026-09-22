"use client";

/**
 * FAQ 提案。設定に登録したホームページの 1 ページについて、
 * ①いまの FAQ の状態（事実）→ ②入れるべき FAQ の提案 → ③そのまま貼れる形、の順に進む。
 *
 * **このツールはホームページを書き換えない**（利用者の決定 2026-09-22:
 * 「SEO・AIO は事実の提示と改善案の提示まで。改善の実行はしない」）。
 * 最後に出すのはコピー用のテキストで、貼る作業はお客様・運用者が行う。
 *
 * 画面が守ること:
 *   - 根拠の無い提案（要確認）は、答えを空のまま採用させない。お客様に聞く内容だけを出す
 *   - 採用した質問と答えは、JSON-LD と HTML の**両方**に同じ内容で出す
 *     （構造化データだけに書くと Google のガイドライン違反になる）
 */
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/page-diagnosis/CopyButton";
import { PageTargetField, SiteTargetNotice, useRegisteredSite } from "@/components/site/RegisteredSite";
import { Badge, Button, Callout, Card, EmptyState, Field, Input } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";
import type { FaqFinding } from "@/lib/faq/audit";
import type { FaqProposalResult } from "@/lib/faq/propose";
import { buildFaqHtml, buildFaqScriptTag } from "@/lib/faq/render";
import { FAQ_BASIS_LABELS, type FaqBasis, type FaqProposal } from "@/lib/faq/schema";
import { useSharedSettings } from "@/lib/settings/client";
import { resolvePageUrl } from "@/lib/site/target";

const FINDING_TONE: Record<FaqFinding["status"], BadgeTone> = { ok: "pass", warn: "warn", fail: "fail" };
const FINDING_LABEL: Record<FaqFinding["status"], string> = { ok: "できている", warn: "確認", fail: "足りない" };
const BASIS_TONE: Record<FaqBasis, BadgeTone> = { page: "pass", karte: "info", "needs-check": "warn" };
const PRIORITY_TONE: Record<FaqProposal["priority"], BadgeTone> = { high: "fail", medium: "warn", low: "info" };
const PRIORITY_LABEL: Record<FaqProposal["priority"], string> = { high: "高", medium: "中", low: "低" };

/** 編集・採用の状態を持たせた提案 */
interface DraftFaq extends FaqProposal {
  id: string;
  adopted: boolean;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDrafts(proposals: readonly FaqProposal[]): DraftFaq[] {
  return proposals.map((p) => ({ ...p, id: newId(), adopted: p.basis !== "needs-check" }));
}

export function FaqTool() {
  // 対象サイトは設定に登録したホームページ。ここで聞くのは「どのページか」だけ
  const site = useRegisteredSite();
  const [page, setPage] = useState("");
  const targetUrl = resolvePageUrl(site.siteUrl, page);
  const [keyword, setKeyword] = useState("");
  const { keywords: keywordSuggestions } = useSharedSettings();

  const [result, setResult] = useState<FaqProposalResult | null>(null);
  const [drafts, setDrafts] = useState<DraftFaq[]>([]);
  const [loading, setLoading] = useState<null | "audit" | "propose">(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopted = useMemo(
    () =>
      drafts
        .filter((d) => d.adopted)
        .map((d) => ({ question: d.question.trim(), answer: d.answer.trim() }))
        .filter((d) => d.question && d.answer),
    [drafts],
  );

  async function run(mode: "audit" | "propose", refresh = false) {
    if (!targetUrl) return;
    setLoading(mode);
    setError(null);
    try {
      const res = await fetch("/api/faq/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          keyword: keyword.trim() || undefined,
          auditOnly: mode === "audit",
          refresh,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `実行できませんでした（HTTP ${res.status}）`);
      const next = body.result as FaqProposalResult;
      setResult(next);
      setDrafts(next.proposals ? toDrafts(next.proposals.proposals) : []);
      setCached(Boolean(body.cached));
    } catch (err) {
      setError(err instanceof Error ? err.message : "実行できませんでした");
    } finally {
      setLoading(null);
    }
  }

  function update(id: string, patch: Partial<DraftFaq>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const busy = loading !== null;

  return (
    <div className="space-y-6">
      <Card
        title="対象ページ"
        description="設定に登録したホームページの 1 ページを見ます。ページを空欄にするとトップページです。まず「いまの FAQ を確かめる」で状態（事実）だけを見て、そのうえで提案を作れます。"
        className="no-print"
      >
        <SiteTargetNotice what="FAQ 提案" className="mb-3" />
        <div className="grid gap-3 @md:grid-cols-[1fr_16rem]">
          <PageTargetField id="faq-page" label="FAQ を入れるページ（任意）" value={page} onChange={setPage} disabled={busy} />
          <Field
            label="対策キーワード（任意）"
            htmlFor="faq-kw"
            hint={keywordSuggestions.length > 0 ? "設定の対策キーワードから選べます。入れると質問の言葉がその語に寄ります" : "入れると質問の言葉がその語に寄ります"}
          >
            <Input
              id="faq-kw"
              list="faq-kw-list"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="港区 税理士"
              disabled={busy}
            />
            <datalist id="faq-kw-list">
              {keywordSuggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void run("audit")} loading={loading === "audit"} disabled={!targetUrl || busy}>
            いまの FAQ を確かめる
          </Button>
          <Button onClick={() => void run("propose")} loading={loading === "propose"} disabled={!targetUrl || busy}>
            FAQ 案を作る
          </Button>
          {result?.proposals && !busy && (
            <Button variant="ghost" onClick={() => void run("propose", true)} disabled={busy}>
              作り直す
            </Button>
          )}
          {cached && !busy && <span className="text-[12px] text-muted">前回の結果を表示しています（作り直すと再生成します）</span>}
        </div>
      </Card>

      {error && (
        <Callout tone="fail" title="実行できませんでした" className="no-print">
          {error}
        </Callout>
      )}

      {!result && !busy && !error && (
        <EmptyState
          title="まだ確認していません"
          description="AI 検索は、質問と答えが対になっている文章をそのまま引用します。まずはいまのページに FAQ が入っているかを確かめてください。"
        />
      )}

      {result && <AuditCard result={result} />}

      {result?.proposals && (
        <ProposalsCard
          summary={result.proposals.summary}
          drafts={drafts}
          onChange={update}
          disabled={busy}
        />
      )}

      {result?.proposals && <SnippetCard faqs={adopted} />}
    </div>
  );
}

function AuditCard({ result }: { result: FaqProposalResult }) {
  const { audit } = result;
  return (
    <Card title="いまの FAQ の状態" description="ページの HTML をそのまま読んだ結果です（AI は使っていません）。" printCard>
      <p className="text-[12px] text-muted">
        <span className="break-all">{result.finalUrl}</span>
        {result.title ? ` ／ ${result.title}` : ""}
      </p>
      <ul className="mt-3 space-y-2">
        {audit.findings.map((f) => (
          <li key={f.id} className="rounded-sm border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={FINDING_TONE[f.status]}>{FINDING_LABEL[f.status]}</Badge>
              <span className="text-[13px] font-bold text-ink">{f.label}</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.detail}</p>
          </li>
        ))}
      </ul>
      {audit.existingQuestions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-bold text-ink">すでにページにある質問（{audit.existingQuestions.length} 件）</h3>
          <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-muted">
            {audit.existingQuestions.slice(0, 20).map((q, i) => (
              <li key={i}>・{q}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function ProposalsCard({
  summary,
  drafts,
  onChange,
  disabled,
}: {
  summary: readonly string[];
  drafts: readonly DraftFaq[];
  onChange: (id: string, patch: Partial<DraftFaq>) => void;
  disabled: boolean;
}) {
  return (
    <Card
      title="入れるべき FAQ"
      description="内容を確認・編集し、ページに載せるものに「採用」を付けてください。採用した分だけを下で貼る形にします。"
      printCard
    >
      <ul className="space-y-1.5 text-sm leading-relaxed text-ink">
        {summary.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <ul className="mt-4 space-y-3">
        {drafts.map((d) => {
          const needsCheck = d.basis === "needs-check";
          const canAdopt = d.question.trim() !== "" && d.answer.trim() !== "";
          return (
            <li key={d.id} className="rounded-sm border border-line p-3 @md:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={PRIORITY_TONE[d.priority]}>優先度 {PRIORITY_LABEL[d.priority]}</Badge>
                  <Badge tone={BASIS_TONE[d.basis]}>{FAQ_BASIS_LABELS[d.basis]}</Badge>
                </div>
                <label className="no-print inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={d.adopted && canAdopt}
                    disabled={disabled || !canAdopt}
                    onChange={(e) => onChange(d.id, { adopted: e.target.checked })}
                    className="h-4 w-4 rounded-sm border-line accent-accent"
                  />
                  採用
                </label>
              </div>

              <input
                value={d.question}
                onChange={(e) => onChange(d.id, { question: e.target.value })}
                aria-label="質問"
                className="no-print mt-2 h-11 w-full rounded-md border border-line bg-panel px-3 text-base font-bold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <textarea
                value={d.answer}
                onChange={(e) => onChange(d.id, { answer: e.target.value })}
                aria-label="回答"
                rows={3}
                placeholder={needsCheck ? "根拠が無いため答えは作っていません。確認した内容をここに書くと採用できます" : ""}
                className="no-print mt-2 w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-base leading-relaxed text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              {/* 入力欄は印刷すると途中で切れるので、紙にはテキストで出す */}
              <div className="print-only">
                <div className="text-[14px] font-bold text-ink">Q. {d.question}</div>
                {d.answer && <div className="mt-1 text-[13px] leading-relaxed text-muted">A. {d.answer}</div>}
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-muted">{d.why}</p>
              {needsCheck && d.askCustomer && (
                <Callout tone="warn" title="お客様に確認してください" className="mt-2">
                  {d.askCustomer}
                </Callout>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SnippetCard({ faqs }: { faqs: readonly { question: string; answer: string }[] }) {
  if (faqs.length === 0) {
    return (
      <Card title="ページに貼る内容" className="no-print">
        <p className="text-[13px] leading-relaxed text-muted">
          採用した FAQ がまだありません。上の一覧で「採用」を付けると、貼る内容をここに作ります
          （答えが空のものは採用できません）。
        </p>
      </Card>
    );
  }

  const items = faqs.map((f) => ({ question: f.question, answer: f.answer }));
  const jsonLd = buildFaqScriptTag(items);
  const html = buildFaqHtml(items);

  return (
    <Card
      title={`ページに貼る内容（採用 ${faqs.length} 件）`}
      description="このツールはホームページを書き換えません。下の 2 つを両方コピーして、ホームページに貼ってください（反映はお客様・運用者の作業です）。"
      printCard
    >
      <Callout tone="info" title="① と ② は必ずセットで貼ってください">
        画面に出ていない FAQ を構造化データにだけ書くのは、Google のガイドライン違反になります。
        文言を直すときは、②（画面に出る文章）と ①（構造化データ）の両方を同じ内容にしてください。
      </Callout>

      <div className="mt-4 space-y-5">
        <Snippet
          title="① 構造化データ（JSON-LD）"
          note="<head> 内、または </body> の直前に貼り付けてください。"
          code={jsonLd}
        />
        <Snippet
          title="② FAQ の HTML"
          note="ページ本文の、FAQ を置きたい位置に貼り付けてください。details / summary なので CSS が無くても折りたたみとして動きます。"
          code={html}
        />
      </div>
    </Card>
  );
}

function Snippet({ title, note, code }: { title: string; note: string; code: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          <p className="text-[11px] leading-relaxed text-muted">{note}</p>
        </div>
        <div className="no-print shrink-0">
          <CopyButton text={code} />
        </div>
      </div>
      <pre className="mt-2 max-h-80 overflow-auto rounded-sm border border-line bg-surface p-3 text-[11px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
