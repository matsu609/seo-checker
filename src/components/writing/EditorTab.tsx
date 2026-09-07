"use client";

/**
 * AI エディター（D3）: 左にチャット指示、右に本文（Markdown）。
 *
 * ・選択範囲があるときは、その部分だけを対象にリライトする
 * ・書き換え結果は差分で見せ、採用 / 破棄を選ばせる
 * ・採用するとバージョン履歴に 1 版残り、いつでも復元できる
 * ・ANTHROPIC_API_KEY が無い環境でも、手書きの編集と書き出しはそのまま使える
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge, Button, Callout, Card, Textarea } from "@/components/ui";
import { keywordResearchStore } from "@/lib/keywords/store";
import { useStore } from "@/lib/store/hooks";
import { requestRewrite, downloadText } from "@/lib/writing/client";
import { QUICK_ACTIONS, stripCodeFence } from "@/lib/writing/convert";
import { countChars, toHtmlDocument } from "@/lib/writing/markdown";
import { restoreDraftVersion, saveVersion, updateDraft, type Draft } from "@/lib/writing/store";
import { DiffView } from "./DiffView";

/** チェック結果から渡される強調位置（クリックのたびに token が変わる） */
export interface EditorHighlight {
  start: number;
  length: number;
  token: number;
}

export interface EditorTabProps {
  draft: Draft;
  anthropicEnabled: boolean;
  highlight: EditorHighlight | null;
}

interface Pending {
  before: string;
  after: string;
  selection: boolean;
  start: number;
  end: number;
  label: string;
}

interface LogEntry {
  role: "user" | "assistant";
  text: string;
}

/** 本文の保存を間引く間隔（打鍵のたびに localStorage へ書かない） */
const SAVE_DELAY_MS = 800;

export function EditorTab({ draft, anthropicEnabled, highlight }: EditorTabProps) {
  const [text, setText] = useState(draft.markdown);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [researches] = useStore(keywordResearchStore);
  const areaId = useId();
  const controller = useRef<AbortController | null>(null);
  const saveTimer = useRef<number | null>(null);

  // 共有の Textarea は ref を受け取らないので、id から DOM を引く
  const areaOf = useCallback(
    () => (typeof document === "undefined" ? null : (document.getElementById(areaId) as HTMLTextAreaElement | null)),
    [areaId],
  );

  // 指摘をクリックしたときに、その位置を選択してスクロールする。
  // state は触らないので react-hooks/set-state-in-effect には当たらない
  useEffect(() => {
    const area = areaOf();
    if (!highlight || !area) return;
    area.focus();
    area.setSelectionRange(highlight.start, highlight.start + highlight.length);
    // だいたいの行位置までスクロールする（1 行 ≒ 22px）
    const line = text.slice(0, highlight.start).split("\n").length;
    area.scrollTop = Math.max(0, (line - 4) * 22);
  }, [areaOf, highlight, text]);

  useEffect(() => {
    return () => {
      controller.current?.abort();
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  /** 関連語（キーワード調査の結果から。無ければ構成案のトピック） */
  const relatedWords = (() => {
    const research =
      researches.find((r) => r.result.seed.trim() === draft.keyword.trim()) ?? researches[0] ?? null;
    const fromResearch = research ? research.result.rows.map((row) => row.keyword) : [];
    const fromOutline = draft.outline ? [...draft.outline.common_topics, ...draft.outline.missing_topics] : [];
    return Array.from(new Set([...fromResearch, ...fromOutline])).slice(0, 30);
  })();

  function changeText(next: string) {
    setText(next);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      updateDraft(draft.id, { markdown: next });
      saveTimer.current = null;
    }, SAVE_DELAY_MS);
  }

  function syncSelection() {
    const area = areaOf();
    if (!area) return;
    setSelection({ start: area.selectionStart, end: area.selectionEnd });
  }

  const selected = text.slice(selection.start, selection.end);
  const hasSelection = selected.trim().length > 0;

  async function rewrite(instruction: string, label: string) {
    if (!anthropicEnabled || busy || !instruction.trim()) return;
    const useSelection = hasSelection;
    const target = useSelection ? selected : text;
    if (!target.trim()) {
      setError("書き換える本文がありません。");
      return;
    }
    const ac = new AbortController();
    controller.current = ac;
    setBusy(true);
    setError(null);
    setStreaming("");
    setPending(null);
    setLog((prev) => [...prev, { role: "user", text: useSelection ? `【選択範囲】${instruction}` : instruction }]);
    try {
      const answer = await requestRewrite({
        target,
        instruction,
        selection: useSelection,
        ...(useSelection
          ? { context: { before: text.slice(0, selection.start), after: text.slice(selection.end) } }
          : {}),
        ...(draft.keyword ? { keyword: draft.keyword } : {}),
        ...(relatedWords.length > 0 ? { relatedWords } : {}),
        tone: draft.tone,
        signal: ac.signal,
        onDelta: (delta) => setStreaming((prev) => prev + delta),
      });
      if (ac.signal.aborted) return;
      const after = stripCodeFence(answer).trim();
      setPending({
        before: target,
        after,
        selection: useSelection,
        start: selection.start,
        end: selection.end,
        label,
      });
      setLog((prev) => [...prev, { role: "assistant", text: "書き換え案を作りました。差分を確認してください。" }]);
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "リライトに失敗しました");
    } finally {
      if (controller.current === ac) controller.current = null;
      setStreaming("");
      setBusy(false);
    }
  }

  function accept() {
    if (!pending) return;
    const next = pending.selection
      ? text.slice(0, pending.start) + pending.after + text.slice(pending.end)
      : pending.after;
    setText(next);
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveVersion(draft.id, next, pending.label);
    setPending(null);
    setSelection({ start: 0, end: 0 });
  }

  function restore(versionId: string, markdown: string) {
    restoreDraftVersion(draft.id, versionId);
    setText(markdown);
    setPending(null);
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("クリップボードにコピーできませんでした。本文を選択してコピーしてください。");
    }
  }

  const chars = text.length;
  const contentChars = countChars(text);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 @4xl:grid-cols-[22rem_1fr]">
        {/* 左: チャット指示 */}
        <Card title="AI への指示" description="選択範囲があるときは、その部分だけを書き換えます。" padding="sm">
          {!anthropicEnabled && (
            <Callout tone="info" className="mb-3" title="AI によるリライトは利用できません">
              ANTHROPIC_API_KEY を設定すると使えます。設定するまでも、右の本文は手で編集でき、書き出しもできます。
            </Callout>
          )}

          <p className="mb-2 text-[12px] text-muted">
            {hasSelection ? `選択範囲 ${selected.length} 文字を対象にします。` : "本文全体を対象にします。"}
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="secondary"
                size="sm"
                disabled={!anthropicEnabled || busy}
                onClick={() => void rewrite(action.instruction, action.label)}
              >
                {action.label}
              </Button>
            ))}
          </div>

          <div
            className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-sm border border-line bg-surface p-2"
            aria-live="polite"
          >
            {log.length === 0 && !streaming && (
              <p className="text-[12px] text-muted">
                まだ指示はありません。上のクイック指示か、下の入力欄から指示してください。
              </p>
            )}
            {log.map((entry, i) => (
              <div
                key={`${i}:${entry.role}`}
                className={`rounded-sm border p-2 text-[12px] leading-relaxed ${
                  entry.role === "user" ? "border-accent bg-accent-soft text-ink" : "border-line bg-panel text-ink"
                }`}
              >
                <p className="mb-0.5 text-[11px] font-bold text-muted">{entry.role === "user" ? "あなた" : "AI"}</p>
                <p className="whitespace-pre-wrap">{entry.text}</p>
              </div>
            ))}
            {streaming && (
              <div className="rounded-sm border border-line bg-panel p-2 text-[12px] leading-relaxed text-ink">
                <p className="mb-0.5 text-[11px] font-bold text-muted">AI（生成中）</p>
                <p className="whitespace-pre-wrap">{streaming}</p>
              </div>
            )}
          </div>

          <Textarea
            rows={3}
            value={input}
            placeholder="例: この節をもう少し具体例を入れて書き直して"
            disabled={!anthropicEnabled || busy}
            aria-label="AI への指示"
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                const instruction = input.trim();
                setInput("");
                void rewrite(instruction, "チャット指示");
              }}
              loading={busy}
              disabled={!anthropicEnabled || input.trim().length === 0}
            >
              指示を送る
            </Button>
            {busy && (
              <Button variant="secondary" onClick={() => controller.current?.abort()}>
                中止
              </Button>
            )}
          </div>

          {error && (
            <Callout tone="fail" className="mt-3">
              {error}
            </Callout>
          )}
        </Card>

        {/* 右: 本文 */}
        <Card
          title="本文（Markdown）"
          description={`${chars.toLocaleString("ja-JP")} 文字（記号・空白を除くと ${contentChars.toLocaleString("ja-JP")} 文字）`}
          padding="sm"
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => void copyAll()}>
                {copied ? "コピーしました" : "クリップボードへ"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(`${fileBase(draft.title)}.md`, text, "text/markdown")}
              >
                Markdown
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadText(`${fileBase(draft.title)}.html`, toHtmlDocument(text, draft.title), "text/html")}
              >
                HTML
              </Button>
            </>
          }
        >
          <Textarea
            id={areaId}
            rows={24}
            value={text}
            aria-label="記事の本文（Markdown）"
            className="font-mono text-[13px] leading-relaxed"
            onChange={(e) => changeText(e.target.value)}
            onSelect={syncSelection}
            onKeyUp={syncSelection}
            onMouseUp={syncSelection}
          />
        </Card>
      </div>

      {pending && (
        <DiffView
          before={pending.before}
          after={pending.after}
          selection={pending.selection}
          busy={busy}
          onAccept={accept}
          onReject={() => setPending(null)}
        />
      )}

      <Card
        title="バージョン履歴"
        description="採用したリライトと生成結果が残ります。復元するとその内容に戻り、復元自体も 1 版として残ります。"
      >
        {draft.versions.length === 0 ? (
          <p className="text-[13px] text-muted">まだ履歴はありません。</p>
        ) : (
          <ul className="divide-y divide-line">
            {draft.versions.map((version, index) => (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 text-[13px] text-ink">
                  {index === 0 && (
                    <Badge tone="info" className="mr-2" icon={false}>
                      最新
                    </Badge>
                  )}
                  <span className="font-bold">{version.label}</span>
                  <span className="ml-2 text-[12px] text-muted">
                    {new Date(version.createdAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="ml-2 text-[12px] text-muted">{version.markdown.length.toLocaleString("ja-JP")} 文字</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => restore(version.id, version.markdown)}>
                  この版に戻す
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** ダウンロードのファイル名（日本語だと download 属性が無視されるブラウザがあるので ASCII に寄せる） */
function fileBase(title: string): string {
  const safe = title.replace(/[^\w.-]/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return safe || "article";
}
