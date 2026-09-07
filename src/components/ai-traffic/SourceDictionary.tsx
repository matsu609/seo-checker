"use client";

/**
 * 参照元辞書の編集（§19「自己拡張できる辞書」）。
 *
 * 追加分だけをブラウザに保存し（aiSourceExtrasStore）、既定辞書は読み取り専用で見せる。
 * GA4 が未設定でも辞書だけ先に整えられるよう、この panel は連携の有無に関係なく動く。
 */
import { useId, useState } from "react";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { addAiSource, aiSourceExtrasStore, removeAiSource } from "@/lib/ai-traffic/store";
import { AI_SOURCE_DICTIONARY, type AiSourceEntry } from "@/lib/ga4/ai-sources";
import { useStore } from "@/lib/store/hooks";

export interface SourceDictionaryProps {
  /** 辞書を変えたら取得し直す必要があることを伝える（取得済みのときだけ） */
  hasResult: boolean;
}

/** 既定辞書をサービス名でまとめる（同じサービスに複数ホストがあるため） */
function groupByService(entries: readonly AiSourceEntry[]): Array<{ service: string; hosts: string[] }> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const hosts = map.get(entry.service) ?? [];
    hosts.push(entry.host);
    map.set(entry.service, hosts);
  }
  return Array.from(map.entries()).map(([service, hosts]) => ({ service, hosts }));
}

export function SourceDictionary({ hasResult }: SourceDictionaryProps) {
  const id = useId();
  const [extras] = useStore(aiSourceExtrasStore);
  const [host, setHost] = useState("");
  const [service, setService] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const message = addAiSource(host, service);
    setError(message);
    if (message === null) {
      setHost("");
      setService("");
    }
  }

  const builtIn = groupByService(AI_SOURCE_DICTIONARY);

  return (
    <Card
      title="参照元辞書"
      description="GA4 の参照元（sessionSource）をサービス名に対応づける辞書です。ここに載っているホストからの流入だけを「AI 検索」として数えます。追加分はこのブラウザに保存されます。"
    >
      <div className="grid gap-3 @2xl:grid-cols-[1fr_1fr_auto] @2xl:items-end">
        <Field label="参照元のホスト名" htmlFor={`${id}-host`} hint="例: chatgpt.com（サブドメインにも一致します）">
          <Input
            id={`${id}-host`}
            value={host}
            placeholder="chatgpt.com"
            onChange={(e) => {
              setHost(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
          />
        </Field>
        <Field label="サービス名" htmlFor={`${id}-service`} hint="グラフの凡例に出る名前">
          <Input
            id={`${id}-service`}
            value={service}
            placeholder="ChatGPT"
            onChange={(e) => {
              setService(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
          />
        </Field>
        <Button variant="secondary" size="lg" onClick={add}>
          辞書に追加
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-[12px] text-fail" role="alert">
          {error}
        </p>
      )}
      {hasResult && (
        <p className="mt-2 text-[12px] text-muted">
          辞書を変えたら「再取得」を押すと、新しい辞書で集計し直します。
        </p>
      )}

      <h3 className="mt-6 mb-2 text-sm font-bold text-ink">追加した参照元（{extras.length} 件）</h3>
      {extras.length === 0 ? (
        <p className="text-[13px] text-muted">まだ追加していません。GA4 の「参照元 / メディア」で見つけた AI サービスのホストを登録してください。</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line text-[13px]">
          {extras.map((entry) => (
            <li key={entry.host} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <code className="font-mono text-[12px] break-all text-ink">{entry.host}</code>
              <span className="text-ink">{entry.service}</span>
              <button
                type="button"
                onClick={() => removeAiSource(entry.host)}
                className="ml-auto rounded-sm text-[12px] text-muted outline-none hover:text-fail focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-bold text-ink">
          既定の辞書（{AI_SOURCE_DICTIONARY.length} ホスト・編集不可）
        </summary>
        <ul className="mt-2 divide-y divide-line border-y border-line text-[13px]">
          {builtIn.map((row) => (
            <li key={row.service} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span className="w-40 shrink-0 text-ink">{row.service}</span>
              <span className="flex flex-wrap gap-1">
                {row.hosts.map((h) => (
                  <Badge key={h} tone="id">
                    {h}
                  </Badge>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">
          同じホストを追加すると、既定の辞書より追加した設定が優先されます。
        </p>
      </details>
    </Card>
  );
}
