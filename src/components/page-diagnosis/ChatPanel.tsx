"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Callout, Card, Textarea } from "@/components/ui";
import type { StoredDiagnosis } from "@/lib/page-diagnosis/store";
import type { ChatMessage, DiagnosisResult } from "@/lib/page-diagnosis/types";
import { requestChat } from "./client";

/** よく使う質問（実装ガイド §9.4 の例） */
const QUICK_PROMPTS = [
  "この提案をもとに見出し案を 3 つ出して",
  "上位ページに共通していて自社に無い要素は？",
  "最優先で直すべきポイントを 3 つに絞って",
];

export function ChatPanel({ diagnosis, disabled }: { diagnosis: StoredDiagnosis; disabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // 診断を切り替えたときの会話のリセットは、呼び出し側が key={diagnosis.id} を
  // 渡してこのコンポーネントごと作り直すことで行う。副作用で state を消すと
  // 余計な再レンダリングが 1 往復増えるため。

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, streaming]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || disabled) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setStreaming("");
    setError(null);
    setBusy(true);
    const ac = new AbortController();
    controller.current = ac;
    try {
      const answer = await requestChat({
        // ストアの型は zod 由来で緩いが、中身は診断結果そのもの
        result: diagnosis as unknown as DiagnosisResult,
        messages: next,
        signal: ac.signal,
        onDelta: (delta) => setStreaming((prev) => prev + delta),
      });
      if (ac.signal.aborted) return;
      setMessages([...next, { role: "assistant", content: answer }]);
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "チャットに失敗しました");
      setMessages(next);
    } finally {
      if (controller.current === ac) controller.current = null;
      setStreaming("");
      setBusy(false);
    }
  }

  return (
    <Card
      title="AI チャット"
      description="この診断結果を前提に質問できます。見出し案や本文案の作成にも使えます。"
      actions={
        messages.length > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => setMessages([])} disabled={busy}>
            会話をリセット
          </Button>
        ) : null
      }
    >
      {disabled && (
        <Callout tone="info" title="AI チャットは利用できません" className="mb-4">
          チャットには ANTHROPIC_API_KEY の設定が必要です。
        </Callout>
      )}

      <div
        ref={logRef}
        className="max-h-96 space-y-3 overflow-y-auto rounded-sm border border-line bg-surface p-3"
        aria-live="polite"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-[13px] text-muted">まだ会話はありません。下の入力欄か、よく使う質問から始めてください。</p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${i}:${m.role}`}
            className={`rounded-sm border p-3 text-[13px] leading-relaxed ${
              m.role === "user" ? "border-accent bg-accent-soft text-ink" : "border-line bg-panel text-ink"
            }`}
          >
            <p className="mb-1 text-[11px] font-bold text-muted">{m.role === "user" ? "あなた" : "AI"}</p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {streaming && (
          <div className="rounded-sm border border-line bg-panel p-3 text-[13px] leading-relaxed text-ink">
            <p className="mb-1 text-[11px] font-bold text-muted">AI</p>
            <p className="whitespace-pre-wrap">{streaming}</p>
          </div>
        )}
      </div>

      {error && (
        <Callout tone="fail" className="mt-3">
          {error}
        </Callout>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <Button key={q} variant="secondary" size="sm" onClick={() => void send(q)} disabled={busy || disabled}>
            {q}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          value={input}
          rows={2}
          placeholder="例: 「価格の相場」の節を 400 字で書いて"
          onChange={(e) => setInput(e.target.value)}
          disabled={busy || disabled}
          className="flex-1"
          aria-label="AI への質問"
        />
        <div className="flex gap-2">
          <Button onClick={() => void send(input)} loading={busy} disabled={disabled || input.trim().length === 0}>
            送信
          </Button>
          {busy && (
            <Button variant="secondary" onClick={() => controller.current?.abort()}>
              中止
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
