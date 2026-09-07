"use client";

/**
 * 企画書モード（D2）: 書きたい内容 + 参考資料（Google 検索結果 / PDF）→ 企画書 → 執筆へ。
 *
 * PDF はブラウザで base64 にしてから送る。サイズ・形式の検証は
 * 送信前（ここ）とサーバー側の両方で行う（クライアントの申告は信用しない）。
 */
import { useId, useState } from "react";
import { Badge, Button, Callout, Card, Field, Input, Textarea } from "@/components/ui";
import { useToolRun } from "@/lib/tools/run";
import { fileToBase64 } from "@/lib/writing/client";
import { MAX_PLAN_CONTENT_CHARS, planToOutline } from "@/lib/writing/convert";
import { writingSettingsStore } from "@/lib/writing/store";
import { useStore } from "@/lib/store/hooks";
import { formatBytes, MAX_PDF_BYTES, validatePdfUpload } from "@/lib/writing/upload";
import type { ArticleOutline, ArticlePlan, PlanResult } from "@/lib/writing/types";

interface PlanResponse {
  result: PlanResult;
}

interface AttachedPdf {
  name: string;
  mediaType: string;
  data: string;
  bytes: number;
}

export interface PlanTabProps {
  anthropicEnabled: boolean;
  /** 「この企画書で執筆」で構成案として渡す */
  onAdopt: (outline: ArticleOutline, keyword: string, plan: ArticlePlan) => void;
}

export function PlanTab({ anthropicEnabled, onAdopt }: PlanTabProps) {
  const id = useId();
  const [settings, setSettings] = useStore(writingSettingsStore);
  const [reference, setReference] = useState("");
  const [pdf, setPdf] = useState<AttachedPdf | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ArticlePlan | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const run = useToolRun<PlanResponse>();

  const content = settings.planContent;
  const running = run.state.phase === "running";
  const canRun = anthropicEnabled && content.trim().length > 0 && !running;

  async function attach(file: File | null) {
    setUploadError(null);
    if (!file) {
      setPdf(null);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdf(null);
      setUploadError(`PDF は ${formatBytes(MAX_PDF_BYTES)} までです（選択したファイルは ${formatBytes(file.size)}）。`);
      return;
    }
    try {
      const data = await fileToBase64(file);
      const check = validatePdfUpload({ name: file.name, mediaType: file.type, data });
      if (!check.ok) {
        setPdf(null);
        setUploadError(check.error);
        return;
      }
      setPdf({ name: check.name, mediaType: "application/pdf", data: check.data, bytes: check.bytes });
    } catch {
      setPdf(null);
      setUploadError("ファイルを読み込めませんでした。もう一度選び直してください。");
    }
  }

  async function generate() {
    if (!canRun) return;
    const data = await run.run("/api/writing/plan", {
      content: content.trim(),
      useWebSearch: settings.planUseWebSearch,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(settings.keyword.trim() ? { keyword: settings.keyword.trim() } : {}),
      ...(pdf ? { pdf: { name: pdf.name, mediaType: pdf.mediaType, data: pdf.data } } : {}),
    });
    if (!data) return;
    setResult(data.result);
    setPlan(data.result.plan);
  }

  return (
    <div className="space-y-6">
      <Card
        title="企画書のもとになる情報"
        description="書きたい内容と参考資料から、タイトル案・想定読者・目的・対策キーワード・構成・注意点をまとめた企画書を作ります。"
        actions={
          <>
            <Button onClick={() => void generate()} loading={running} disabled={!canRun}>
              企画書を作成
            </Button>
            {running && (
              <Button variant="secondary" onClick={run.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <Field
          label="書きたい内容"
          htmlFor={`${id}-content`}
          required
          hint={`${content.length} / ${MAX_PLAN_CONTENT_CHARS} 文字`}
        >
          <Textarea
            id={`${id}-content`}
            rows={5}
            value={content}
            placeholder="新しく始めた AIO 対策コンサルの紹介記事。まだ AIO を知らない中小企業の担当者向けに、必要性と始め方を説明したい。"
            disabled={running}
            onChange={(e) => setSettings({ ...settings, planContent: e.target.value.slice(0, MAX_PLAN_CONTENT_CHARS) })}
          />
        </Field>

        <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
          <Field label="想定している対策キーワード（任意）" htmlFor={`${id}-keyword`}>
            <Input
              id={`${id}-keyword`}
              value={settings.keyword}
              placeholder="AIO 対策"
              disabled={running}
              onChange={(e) => setSettings({ ...settings, keyword: e.target.value })}
            />
          </Field>

          <Field label="参考メモ（任意）" htmlFor={`${id}-reference`} hint="過去の診断結果やキーワード調査の結果を貼り付けられます。">
            <Textarea
              id={`${id}-reference`}
              rows={2}
              value={reference}
              disabled={running}
              onChange={(e) => setReference(e.target.value.slice(0, 8_000))}
            />
          </Field>
        </div>

        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={settings.planUseWebSearch}
            disabled={running || !anthropicEnabled}
            onChange={(e) => setSettings({ ...settings, planUseWebSearch: e.target.checked })}
          />
          <span>
            Google 検索結果を参考にする
            <span className="ml-1 text-muted">（Claude の Web 検索で最新の情報を調べ、引用元を企画書に残します）</span>
          </span>
        </label>

        <div className="mt-4">
          <Field
            label="参考資料の PDF（任意）"
            htmlFor={`${id}-pdf`}
            hint={`${formatBytes(MAX_PDF_BYTES)} までの PDF。引用したページ番号を企画書に残します。`}
            error={uploadError}
          >
            <input
              id={`${id}-pdf`}
              type="file"
              accept="application/pdf,.pdf"
              disabled={running}
              onChange={(e) => void attach(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:py-2 file:text-[13px] file:font-bold file:text-ink"
            />
          </Field>
          {pdf && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <Badge tone="info" icon={false}>
                添付
              </Badge>
              <span className="break-all text-ink">{pdf.name}</span>
              <span>{formatBytes(pdf.bytes)}</span>
              <Button variant="ghost" size="sm" onClick={() => setPdf(null)} disabled={running}>
                取り消す
              </Button>
            </p>
          )}
        </div>

        {!anthropicEnabled && (
          <Callout tone="info" className="mt-4" title="企画書の生成は実行できません">
            企画書の生成には ANTHROPIC_API_KEY が必要です。設定するまで、入力内容の保存だけが行えます。
          </Callout>
        )}

        {run.state.phase === "error" && (
          <Callout tone="fail" className="mt-4">
            {run.state.message}
          </Callout>
        )}
      </Card>

      {plan && result ? (
        <PlanEditor
          plan={plan}
          result={result}
          onChange={setPlan}
          onAdopt={() => onAdopt(planToOutline(plan), settings.keyword.trim() || plan.target_keywords[0] || "", plan)}
        />
      ) : (
        <Card title="企画書">
          <p className="text-[13px] leading-relaxed text-muted">
            まだ企画書がありません。書きたい内容を入れて「企画書を作成」を押すと、ここに編集できる企画書が表示されます。内容を直してから「この企画書で執筆」を押すと、構成案として一発生成タブに渡ります。
          </p>
        </Card>
      )}
    </div>
  );
}

interface PlanEditorProps {
  plan: ArticlePlan;
  result: PlanResult;
  onChange: (plan: ArticlePlan) => void;
  onAdopt: () => void;
}

/** 生成された企画書を編集する（そのまま執筆に渡す前提なので全項目を直せる） */
function PlanEditor({ plan, result, onChange, onAdopt }: PlanEditorProps) {
  const id = useId();
  const lines = (values: readonly string[]) => values.join("\n");
  const toList = (value: string) => value.split("\n").map((v) => v.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      {result.notes.length > 0 && (
        <Callout tone="info" title="この企画書についての注記">
          <ul className="list-disc space-y-1 pl-5">
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Card
        title="企画書"
        description="内容を直してから執筆に進めます。"
        actions={
          <Button onClick={onAdopt} disabled={plan.outline.length === 0}>
            この企画書で執筆
          </Button>
        }
      >
        <div className="grid gap-4 @2xl:grid-cols-2">
          <Field label="タイトル案（1 行 1 個）" htmlFor={`${id}-titles`}>
            <Textarea
              id={`${id}-titles`}
              rows={3}
              value={lines(plan.title_suggestions)}
              onChange={(e) => onChange({ ...plan, title_suggestions: toList(e.target.value) })}
            />
          </Field>
          <Field label="対策キーワード（1 行 1 個）" htmlFor={`${id}-keywords`}>
            <Textarea
              id={`${id}-keywords`}
              rows={3}
              value={lines(plan.target_keywords)}
              onChange={(e) => onChange({ ...plan, target_keywords: toList(e.target.value) })}
            />
          </Field>
          <Field label="想定読者" htmlFor={`${id}-audience`}>
            <Textarea
              id={`${id}-audience`}
              rows={3}
              value={plan.audience}
              onChange={(e) => onChange({ ...plan, audience: e.target.value })}
            />
          </Field>
          <Field label="記事の目的" htmlFor={`${id}-purpose`}>
            <Textarea
              id={`${id}-purpose`}
              rows={3}
              value={plan.purpose}
              onChange={(e) => onChange({ ...plan, purpose: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[13px] font-bold text-ink">構成</p>
          <ol className="space-y-3">
            {plan.outline.map((section, index) => (
              <li key={index} className="rounded-sm border border-line bg-surface p-3">
                <Field label={`${index + 1}. h2 見出し`} htmlFor={`${id}-h2-${index}`}>
                  <Input
                    id={`${id}-h2-${index}`}
                    value={section.h2}
                    onChange={(e) =>
                      onChange({
                        ...plan,
                        outline: plan.outline.map((s, i) => (i === index ? { ...s, h2: e.target.value } : s)),
                      })
                    }
                  />
                </Field>
                <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
                  <Field label="h3 見出し（1 行 1 個）" htmlFor={`${id}-h3-${index}`}>
                    <Textarea
                      id={`${id}-h3-${index}`}
                      rows={2}
                      value={lines(section.h3)}
                      onChange={(e) =>
                        onChange({
                          ...plan,
                          outline: plan.outline.map((s, i) =>
                            i === index ? { ...s, h3: toList(e.target.value) } : s,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="要点" htmlFor={`${id}-points-${index}`}>
                    <Textarea
                      id={`${id}-points-${index}`}
                      rows={2}
                      value={section.points}
                      onChange={(e) =>
                        onChange({
                          ...plan,
                          outline: plan.outline.map((s, i) =>
                            i === index ? { ...s, points: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
          <Field label="参考情報（1 行 1 個）" htmlFor={`${id}-references`}>
            <Textarea
              id={`${id}-references`}
              rows={3}
              value={lines(plan.references)}
              onChange={(e) => onChange({ ...plan, references: toList(e.target.value) })}
            />
          </Field>
          <Field label="注意点（1 行 1 個）" htmlFor={`${id}-cautions`}>
            <Textarea
              id={`${id}-cautions`}
              rows={3}
              value={lines(plan.cautions)}
              onChange={(e) => onChange({ ...plan, cautions: toList(e.target.value) })}
            />
          </Field>
        </div>

        {result.sources.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[12px] font-bold text-muted">引用元</p>
            <ul className="mt-1 space-y-1 text-[13px]">
              {result.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-accent underline-offset-2 hover:underline"
                  >
                    {s.title ?? s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.searchQueries.length > 0 && (
          <p className="mt-3 text-[12px] text-muted">
            AI が検索したクエリ: {result.searchQueries.join(" / ")}
          </p>
        )}
      </Card>
    </div>
  );
}
