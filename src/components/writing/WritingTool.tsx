"use client";

/**
 * AI ライティング・エディター（D1〜D4）の画面。
 *
 * タブで 4 つのモードを切り替える:
 *   一発生成（D1） / 企画書（D2） / エディター（D3） / チェック（D4）
 * 下書きはブラウザ（localStorage）に保存し、タブをまたいで同じものを編集する。
 *
 * ANTHROPIC_API_KEY が無い環境では、生成系のボタンだけを止める
 * （PageHeader が SetupNotice を出す。説明・編集・書き出しはそのまま使える）。
 */
import { useMemo, useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Tabs } from "@/components/ui";
import { useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { addDraft, currentDraftIdStore, draftsStore, findDraft, removeDraft } from "@/lib/writing/store";
import type { ArticleOutline, ArticlePlan } from "@/lib/writing/types";
import { CheckTab } from "./CheckTab";
import { EditorTab, type EditorHighlight } from "./EditorTab";
import { GenerateTab } from "./GenerateTab";
import { PlanTab } from "./PlanTab";

type TabId = "generate" | "plan" | "editor" | "check";

interface OutlineMeta {
  keyword: string;
  notes: string[];
  source: string;
}

const TABS = [
  { id: "generate" as const, label: "一発生成" },
  { id: "plan" as const, label: "企画書モード" },
  { id: "editor" as const, label: "エディター" },
  { id: "check" as const, label: "チェック" },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

export function WritingTool() {
  const { status } = useIntegrations();
  const anthropicEnabled = status?.anthropic === true;
  const serpEnabled = status?.serpapi === true;

  const [drafts] = useStore(draftsStore);
  const [currentId, setCurrentId] = useStore(currentDraftIdStore);
  const [tab, setTab] = useState<TabId>("generate");
  const [outline, setOutline] = useState<ArticleOutline | null>(null);
  const [meta, setMeta] = useState<OutlineMeta | null>(null);
  const [highlight, setHighlight] = useState<EditorHighlight | null>(null);

  // 選択中の下書きが消えたときは先頭に戻す（副作用で state を消さず派生値で吸収する）
  const draft = useMemo(() => findDraft(drafts, currentId) ?? drafts[0] ?? null, [drafts, currentId]);

  function adoptPlan(next: ArticleOutline, keyword: string, plan: ArticlePlan) {
    setOutline(next);
    setMeta({
      keyword,
      notes: [
        "企画書から構成案を作りました。想定文字数は既定値（600 字）です。必要なら見出しごとに直してください。",
        ...(plan.cautions.length > 0 ? [`企画書の注意点: ${plan.cautions.join(" / ")}`] : []),
      ],
      source: "企画書モードから引き継いだ構成案",
    });
    setTab("generate");
  }

  function focusIssue(start: number, length: number) {
    setHighlight({ start, length, token: Date.now() });
    setTab("editor");
  }

  return (
    <div className="space-y-6">
      <Card
        title="下書き"
        description="生成した記事はこのブラウザに保存されます（最新 20 件）。タブを切り替えても同じ下書きを編集します。"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              addDraft({ title: "無題の記事", markdown: "" });
              setTab("editor");
            }}
          >
            空の下書きを作る
          </Button>
        }
      >
        {drafts.length === 0 ? (
          <p className="text-[13px] text-muted">
            まだ下書きはありません。「一発生成」で記事を作るか、「空の下書きを作る」から手書きで始められます。
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {drafts.map((d) => {
              const active = draft?.id === d.id;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => setCurrentId(d.id)}
                    className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className={`text-[13px] ${active ? "font-bold text-accent" : "text-ink"}`}>{d.title}</span>
                    {d.keyword && <span className="ml-2 text-[12px] text-muted">{d.keyword}</span>}
                    <span className="ml-2 text-[12px] text-muted">{d.markdown.length.toLocaleString("ja-JP")} 文字</span>
                    <span className="ml-2 text-[11px] text-muted">{formatDateTime(d.updatedAt)}</span>
                    {d.versions.length > 0 && (
                      <Badge tone="neutral" className="ml-2">
                        {d.versions.length} 版
                      </Badge>
                    )}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => removeDraft(d.id)}>
                    削除
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="AI ライティングの表示切り替え" />

      {tab === "generate" && (
        <GenerateTab
          anthropicEnabled={anthropicEnabled}
          serpEnabled={serpEnabled}
          outline={outline}
          meta={meta}
          onOutline={(next, nextMeta) => {
            setOutline(next);
            setMeta(nextMeta);
          }}
          onDraftCreated={() => setTab("editor")}
        />
      )}

      {tab === "plan" && <PlanTab anthropicEnabled={anthropicEnabled} onAdopt={adoptPlan} />}

      {tab === "editor" &&
        (draft ? (
          // 下書きを切り替えたときは key で作り直す（副作用で state を同期しない）
          <EditorTab key={draft.id} draft={draft} anthropicEnabled={anthropicEnabled} highlight={highlight} />
        ) : (
          <EmptyState
            title="編集する下書きがありません"
            description="「一発生成」で記事を作るか、上の「空の下書きを作る」から始めてください。"
          />
        ))}

      {tab === "check" && (
        <CheckTab draft={draft} anthropicEnabled={anthropicEnabled} onFocusIssue={focusIssue} />
      )}

      {!anthropicEnabled && tab !== "editor" && (
        <Callout tone="info" title="AI を使う機能は現在停止しています">
          サーバーに ANTHROPIC_API_KEY を設定すると、構成案・本文・企画書・リライト・ファクトチェック・コピペチェックが使えるようになります。
          設定が無い状態でも、エディターでの手書き編集・書き出しと、薬機法チェック（辞書による走査）はそのまま使えます。
        </Callout>
      )}
    </div>
  );
}
