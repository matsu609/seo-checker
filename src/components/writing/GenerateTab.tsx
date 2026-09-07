"use client";

/**
 * 一発生成（D1）: キーワード → 上位分析 → 構成案 → 見出しごとの本文生成。
 *
 * 本文はストリーミング（NDJSON）で受け取り、生成中の文章と進捗をそのまま見せる。
 * ANTHROPIC_API_KEY が無い環境では実行ボタンだけを止め、説明は表示したままにする。
 */
import { useId, useRef, useState } from "react";
import { Button, Callout, Card, Field, Input, ProgressBar, Select, Textarea } from "@/components/ui";
import { rankKeywordsStore } from "@/lib/rank/store";
import { useStore } from "@/lib/store/hooks";
import { useToolRun } from "@/lib/tools/run";
import { requestBody } from "@/lib/writing/client";
import { outlineToMarkdown } from "@/lib/writing/markdown";
import { addDraft, writingSettingsStore } from "@/lib/writing/store";
import type { ArticleOutline, OutlineResult, WritingTone } from "@/lib/writing/types";
import { OutlineEditor } from "./OutlineEditor";

interface OutlineResponse {
  result: OutlineResult;
  cached?: boolean;
}

export interface GenerateTabProps {
  anthropicEnabled: boolean;
  serpEnabled: boolean;
  outline: ArticleOutline | null;
  meta: { keyword: string; notes: string[]; source: string } | null;
  onOutline: (outline: ArticleOutline | null, meta: { keyword: string; notes: string[]; source: string } | null) => void;
  /** 本文が完成して下書きになったら呼ぶ（エディターへ移動する） */
  onDraftCreated: () => void;
}

interface Progress {
  index: number;
  total: number;
  h2: string;
}

export function GenerateTab({
  anthropicEnabled,
  serpEnabled,
  outline,
  meta,
  onOutline,
  onDraftCreated,
}: GenerateTabProps) {
  const id = useId();
  const [settings, setSettings] = useStore(writingSettingsStore);
  const [rankKeywords] = useStore(rankKeywordsStore);
  const outlineRun = useToolRun<OutlineResponse>();

  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [live, setLive] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const keyword = settings.keyword.trim();
  const keywordSuggestions = Array.from(new Set(rankKeywords.map((k) => k.keyword).filter(Boolean))).slice(0, 50);
  const outlining = outlineRun.state.phase === "running";
  const busy = outlining || writing;

  async function createOutline() {
    if (!keyword || !anthropicEnabled) return;
    setBodyError(null);
    const data = await outlineRun.run("/api/writing/outline", {
      keyword,
      ...(settings.memo.trim() ? { memo: settings.memo.trim() } : {}),
      tone: settings.tone,
      targetChars: settings.targetChars,
      useSerp: settings.useSerp,
    });
    if (!data) return;
    onOutline(data.result.outline, {
      keyword: data.result.keyword,
      notes: data.result.notes,
      source: data.result.serpSource === "serpapi" ? "検索 API による上位 10 件の分析" : "上位分析なし（キーワードのみ）",
    });
    setDone([]);
    setLive("");
  }

  async function writeBody() {
    if (!outline || !anthropicEnabled) return;
    const ac = new AbortController();
    controller.current = ac;
    setWriting(true);
    setBodyError(null);
    setDone([]);
    setLive("");
    setProgress(null);
    try {
      const markdown = await requestBody({
        keyword: meta?.keyword || keyword,
        outline,
        tone: settings.tone,
        signal: ac.signal,
        onEvent: (event) => {
          if (event.type === "section-start") {
            setProgress({ index: event.index, total: event.total, h2: event.h2 });
            setLive("");
          } else if (event.type === "delta") {
            setLive((prev) => prev + event.text);
          } else if (event.type === "section-end") {
            setDone((prev) => [...prev, event.markdown.trim()]);
            setLive("");
          } else if (event.type === "error") {
            setBodyError(event.error);
          }
        },
      });
      if (ac.signal.aborted) return;
      const title = outline.title_suggestions[0] || meta?.keyword || keyword;
      addDraft({
        title,
        keyword: meta?.keyword || keyword,
        tone: settings.tone,
        markdown: `# ${title}\n\n${markdown}`,
        outline,
      });
      onDraftCreated();
    } catch (err) {
      if (ac.signal.aborted) return;
      setBodyError(err instanceof Error ? err.message : "本文の生成に失敗しました");
    } finally {
      if (controller.current === ac) controller.current = null;
      setWriting(false);
      setProgress(null);
    }
  }

  function saveOutlineOnly() {
    if (!outline) return;
    const title = outline.title_suggestions[0] || meta?.keyword || keyword;
    addDraft({
      title,
      keyword: meta?.keyword || keyword,
      tone: settings.tone,
      markdown: outlineToMarkdown(outline, title),
      outline,
    });
    onDraftCreated();
  }

  return (
    <div className="space-y-6">
      <Card
        title="生成条件"
        description="対策キーワードから、上位ページの傾向をふまえた構成案を作ります。構成案を直してから本文を生成できます。"
        actions={
          <>
            <Button onClick={() => void createOutline()} loading={outlining} disabled={!anthropicEnabled || !keyword || writing}>
              {outline ? "構成案を作り直す" : "構成案を作成"}
            </Button>
            {outlining && (
              <Button variant="secondary" onClick={outlineRun.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4 @2xl:grid-cols-2">
          <Field
            label="対策キーワード"
            htmlFor={`${id}-keyword`}
            required
            hint={
              keywordSuggestions.length > 0
                ? "順位計測に登録済みのキーワードから選べます。"
                : "例: AIO 対策 とは"
            }
          >
            <Input
              id={`${id}-keyword`}
              list={`${id}-keyword-list`}
              value={settings.keyword}
              placeholder="対策キーワード"
              disabled={busy}
              onChange={(e) => setSettings({ ...settings, keyword: e.target.value })}
            />
            <datalist id={`${id}-keyword-list`}>
              {keywordSuggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>

          <Field label="補足（任意）" htmlFor={`${id}-memo`} hint="記事の狙い・触れてほしいこと・避けたいことなど。">
            <Textarea
              id={`${id}-memo`}
              rows={2}
              value={settings.memo}
              placeholder="自社サービスの紹介は最後に 1 段落だけ"
              disabled={busy}
              onChange={(e) => setSettings({ ...settings, memo: e.target.value.slice(0, 1_000) })}
            />
          </Field>

          <Field label="文体" htmlFor={`${id}-tone`}>
            <Select
              id={`${id}-tone`}
              value={settings.tone}
              disabled={busy}
              onChange={(e) => setSettings({ ...settings, tone: e.target.value as WritingTone })}
            >
              <option value="desu">ですます調</option>
              <option value="dearu">だ・である調</option>
            </Select>
          </Field>

          <Field label="目標文字数（全体）" htmlFor={`${id}-target`} hint="見出しごとの想定文字数の目安になります。">
            <Input
              id={`${id}-target`}
              type="number"
              min={500}
              max={20000}
              step={500}
              value={settings.targetChars}
              disabled={busy}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  targetChars: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 4_000,
                })
              }
            />
          </Field>
        </div>

        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-accent"
            checked={settings.useSerp && serpEnabled}
            disabled={busy || !serpEnabled}
            onChange={(e) => setSettings({ ...settings, useSerp: e.target.checked })}
          />
          <span>
            検索上位 10 件を分析して構成案に反映する
            {!serpEnabled && (
              <span className="ml-1 text-muted">
                （SERPAPI_KEY が未設定のため使えません。キーワードだけから構成案を作ります）
              </span>
            )}
          </span>
        </label>

        {!anthropicEnabled && (
          <Callout tone="info" className="mt-4" title="生成は実行できません">
            構成案と本文の生成には ANTHROPIC_API_KEY が必要です。設定するまで、この画面では条件の入力と保存済みの下書きの編集・書き出しだけが行えます。
          </Callout>
        )}

        {outlineRun.state.phase === "error" && (
          <Callout tone="fail" className="mt-4">
            {outlineRun.state.message}
          </Callout>
        )}
      </Card>

      {meta && meta.notes.length > 0 && (
        <Callout tone="info" title="この構成案についての注記">
          <ul className="list-disc space-y-1 pl-5">
            {meta.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}

      {outline ? (
        <>
          <OutlineEditor
            outline={outline}
            disabled={busy}
            onChange={(next) => onOutline(next, meta)}
            actions={meta ? <span className="text-[12px] text-muted">{meta.source}</span> : null}
          />

          <Card
            title="本文を生成"
            description="見出しごとに順番に生成します。前後の見出しを文脈として渡すので、途中で中止しても書けた分は残ります。"
            actions={
              <>
                <Button
                  onClick={() => void writeBody()}
                  loading={writing}
                  disabled={!anthropicEnabled || outline.outline.length === 0 || outlining}
                >
                  本文を生成
                </Button>
                {writing && (
                  <Button variant="secondary" onClick={() => controller.current?.abort()}>
                    中止
                  </Button>
                )}
                <Button variant="secondary" onClick={saveOutlineOnly} disabled={busy}>
                  構成案だけ下書きに保存
                </Button>
              </>
            }
          >
            {writing && (
              <ProgressBar
                value={progress ? progress.index : 0}
                max={progress ? progress.total : 1}
                label={
                  progress
                    ? `${progress.index + 1} / ${progress.total} 見出し目「${progress.h2}」を生成しています…`
                    : "生成を開始しています…"
                }
                className="mb-4"
              />
            )}

            {bodyError && (
              <Callout tone="fail" className="mb-4">
                {bodyError}
              </Callout>
            )}

            {done.length === 0 && !live && !writing ? (
              <p className="text-[13px] text-muted">
                「本文を生成」を押すと、上の構成案の見出し順に本文を書きます。完成すると下書きとして保存され、エディターで編集できます。
              </p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink" aria-live="polite">
                {done.join("\n\n")}
                {done.length > 0 && live ? "\n\n" : ""}
                {live}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card title="構成案">
          <p className="text-[13px] leading-relaxed text-muted">
            まだ構成案がありません。対策キーワードを入れて「構成案を作成」を押すと、検索意図・読者像・上位ページの共通トピック・不足トピックと、h2 / h3 の構成案が表示されます。
          </p>
        </Card>
      )}
    </div>
  );
}
