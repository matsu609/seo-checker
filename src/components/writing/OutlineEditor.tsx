"use client";

/**
 * 構成案（D1）の表示と編集。
 * 見出し・狙い・想定文字数をその場で直してから本文生成に渡せるようにする。
 */
import { useId } from "react";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { MAX_SECTIONS } from "@/lib/writing/convert";
import type { ArticleOutline, OutlineSection } from "@/lib/writing/types";

export interface OutlineEditorProps {
  outline: ArticleOutline;
  onChange: (outline: ArticleOutline) => void;
  disabled?: boolean;
  actions?: React.ReactNode;
}

function replaceSection(outline: ArticleOutline, index: number, patch: Partial<OutlineSection>): ArticleOutline {
  return {
    ...outline,
    outline: outline.outline.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  };
}

export function OutlineEditor({ outline, onChange, disabled = false, actions }: OutlineEditorProps) {
  const id = useId();
  const totalChars = outline.outline.reduce((sum, s) => sum + s.target_chars, 0);

  return (
    <div className="space-y-4">
      <Card title="検索意図と読者像" description="上位ページと検索結果から読み取った前提です。" actions={actions}>
        <dl className="grid gap-4 @2xl:grid-cols-2">
          <div>
            <dt className="text-[12px] font-bold text-muted">検索意図</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink">{outline.search_intent || "（取得できませんでした）"}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-muted">読者像</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink">{outline.audience || "（取得できませんでした）"}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-muted">上位ページの共通トピック</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {outline.common_topics.length > 0 ? (
                outline.common_topics.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-[13px] text-muted">（なし）</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold text-muted">不足トピック（差別化できる点）</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {outline.missing_topics.length > 0 ? (
                outline.missing_topics.map((t) => (
                  <Badge key={t} tone="info" icon={false}>
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-[13px] text-muted">（なし）</span>
              )}
            </dd>
          </div>
        </dl>

        {(outline.title_suggestions.length > 0 || outline.description_suggestions.length > 0) && (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 @2xl:grid-cols-2">
            <div>
              <p className="text-[12px] font-bold text-muted">タイトル案</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink">
                {outline.title_suggestions.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-bold text-muted">meta description 案</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink">
                {outline.description_suggestions.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="構成案"
        description={`h2 は ${MAX_SECTIONS} 個まで。想定文字数の合計は約 ${totalChars.toLocaleString("ja-JP")} 文字です。本文生成の前にここで直せます。`}
      >
        <ol className="space-y-4">
          {outline.outline.map((section, index) => (
            <li key={index} className="rounded-sm border border-line bg-surface p-3">
              <div className="grid gap-3 @2xl:grid-cols-[1fr_9rem]">
                <Field label={`${index + 1}. h2 見出し`} htmlFor={`${id}-h2-${index}`}>
                  <Input
                    id={`${id}-h2-${index}`}
                    value={section.h2}
                    disabled={disabled}
                    onChange={(e) => onChange(replaceSection(outline, index, { h2: e.target.value }))}
                  />
                </Field>
                <Field label="想定文字数" htmlFor={`${id}-chars-${index}`}>
                  <Input
                    id={`${id}-chars-${index}`}
                    type="number"
                    min={100}
                    max={2000}
                    step={100}
                    value={section.target_chars}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(
                        replaceSection(outline, index, {
                          target_chars: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 600,
                        }),
                      )
                    }
                  />
                </Field>
              </div>
              <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
                <Field label="h3 見出し（1 行 1 個）" htmlFor={`${id}-h3-${index}`}>
                  <Textarea
                    id={`${id}-h3-${index}`}
                    rows={3}
                    value={section.h3.join("\n")}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(
                        replaceSection(outline, index, {
                          h3: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                        }),
                      )
                    }
                  />
                </Field>
                <Field label="この見出しの狙い" htmlFor={`${id}-goal-${index}`}>
                  <Textarea
                    id={`${id}-goal-${index}`}
                    rows={3}
                    value={section.goal}
                    disabled={disabled}
                    onChange={(e) => onChange(replaceSection(outline, index, { goal: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange({ ...outline, outline: outline.outline.filter((_, i) => i !== index) })}
                >
                  この見出しを削除
                </Button>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || outline.outline.length >= MAX_SECTIONS}
            onClick={() =>
              onChange({
                ...outline,
                outline: [...outline.outline, { h2: "新しい見出し", h3: [], goal: "", target_chars: 600 }],
              })
            }
          >
            見出しを追加
          </Button>
        </div>
      </Card>
    </div>
  );
}
