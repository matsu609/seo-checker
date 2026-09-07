"use client";

/**
 * AI クエリファンアウト（B8）。B4 の実行結果に含まれる検索クエリを見せる。
 * 追加の API 呼び出しは無い（保存済みの結果を読むだけ）。
 */
import { useId, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  type Column,
} from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { fanoutFrequency, fanoutRows, fanoutSupport, type FanoutFrequencyRow, type FanoutRow } from "@/lib/llmo/fanout";
import { providerLabel } from "@/lib/llmo/providers/meta";
import type { LlmoRun, ProviderId } from "@/lib/llmo/types";

export interface FanoutPanelProps {
  runs: readonly LlmoRun[];
}

export function FanoutPanel({ runs }: FanoutPanelProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderId | "all">("all");
  const [copied, setCopied] = useState<string | null>(null);

  const support = useMemo(() => fanoutSupport(runs), [runs]);
  const rows = useMemo(() => fanoutRows(runs), [runs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (provider === "all" || r.providerId === provider) &&
        (q === "" || r.promptText.toLowerCase().includes(q) || r.query.toLowerCase().includes(q)),
    );
  }, [rows, query, provider]);
  const frequency = useMemo(() => fanoutFrequency(rows, 50), [rows]);

  async function copy(label: string, texts: readonly string[]) {
    try {
      await navigator.clipboard.writeText(texts.join("\n"));
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("失敗");
    }
  }

  const listColumns: Column<FanoutRow>[] = [
    { key: "takenOn", header: "日付", width: "6rem", nowrap: true, accessor: (r) => r.takenOn, sortable: true },
    { key: "prompt", header: "プロンプト", accessor: (r) => r.promptText, sortable: true },
    {
      key: "provider",
      header: "モデル",
      width: "7rem",
      accessor: (r) => providerLabel(r.providerId),
      sortable: true,
    },
    { key: "query", header: "検索クエリ", accessor: (r) => r.query, sortable: true },
    {
      key: "fresh",
      header: "最新情報",
      width: "6rem",
      align: "center",
      accessor: (r) => (r.fresh ? 1 : 0),
      sortable: true,
      render: (r) => (r.fresh ? <Badge tone="info">最新</Badge> : <span className="text-muted">—</span>),
    },
  ];

  const freqColumns: Column<FanoutFrequencyRow>[] = [
    { key: "query", header: "検索クエリ", accessor: (r) => r.query, sortable: true },
    { key: "promptCount", header: "プロンプト数", align: "right", width: "7rem", accessor: (r) => r.promptCount, sortable: true },
    { key: "count", header: "出現回数", align: "right", width: "6rem", accessor: (r) => r.count, sortable: true },
    {
      key: "providers",
      header: "モデル",
      width: "12rem",
      render: (r) => r.providers.map((p) => providerLabel(p)).join(" / "),
    },
    {
      key: "fresh",
      header: "最新情報",
      width: "6rem",
      align: "center",
      accessor: (r) => (r.fresh ? 1 : 0),
      sortable: true,
      render: (r) => (r.fresh ? <Badge tone="info">最新</Badge> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title="ファンアウトの取得可否"
        description="AI が回答を作るときに内部で発行した検索クエリです。取得できるかどうかはモデルによって違います。"
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {support.map((s) => (
            <li key={s.providerId} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-0 sm:border-0">
              <span className="font-bold text-ink">{s.label}</span>
              <Badge tone={s.supported ? "pass" : "neutral"} icon={false}>
                {s.supported ? "取得できる" : "対象外"}
              </Badge>
              <span className="text-[12px] text-muted">
                {s.supported ? `クエリ ${s.queries} 件／回答 ${s.answers} 件` : "API がクエリを返しません"}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="ファンアウトクエリがまだありません"
          description="「定点モニタリング」か「LLM リサーチ」を実行すると、回答と一緒に検索クエリが記録されます。"
        />
      ) : (
        <>
          <Card
            title="クエリ一覧"
            description="プロンプト × モデル × クエリ。「最新」は最新・今年・現在・YYYY 年を含むクエリです。"
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void copy("list", filtered.map((r) => r.query))}
                  disabled={filtered.length === 0}
                >
                  {copied === "list" ? "コピーしました" : "順位計測に追加（コピー）"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      csvFileName("llmo-fanout", new Date()),
                      [
                        { header: "日付", value: (r: FanoutRow) => r.takenOn },
                        { header: "プロンプト", value: (r: FanoutRow) => r.promptText },
                        { header: "モデル", value: (r: FanoutRow) => providerLabel(r.providerId) },
                        { header: "検索クエリ", value: (r: FanoutRow) => r.query },
                        { header: "最新情報", value: (r: FanoutRow) => (r.fresh ? "○" : "") },
                      ],
                      filtered,
                    )
                  }
                  disabled={filtered.length === 0}
                >
                  CSV ダウンロード
                </Button>
              </>
            }
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
              <Field label="絞り込み" htmlFor={`${id}-q`}>
                <Input
                  id={`${id}-q`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="プロンプト・クエリの一部"
                />
              </Field>
              <Field label="モデル" htmlFor={`${id}-provider`}>
                <Select
                  id={`${id}-provider`}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId | "all")}
                >
                  <option value="all">すべて</option>
                  {support
                    .filter((s) => s.supported)
                    .map((s) => (
                      <option key={s.providerId} value={s.providerId}>
                        {s.label}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <p className="mb-2 text-[12px] text-muted">
              「順位計測に追加（コピー）」は絞り込み後のクエリをクリップボードにコピーします。順位計測のキーワード登録欄に貼り付けてください。
            </p>
            <DataTable
              rows={filtered}
              columns={listColumns}
              rowKey={(r, i) => `${r.runId}-${i}`}
              dense
              minWidth="46rem"
              defaultSort={{ key: "takenOn", dir: "desc" }}
            />
          </Card>

          <Card
            title="頻出クエリ Top50"
            description="複数のプロンプトで繰り返し検索されているクエリです。AI が何度も調べているのに自社が上位にいないものが最優先の企画候補になります。"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copy("freq", frequency.map((r) => r.query))}
                disabled={frequency.length === 0}
              >
                {copied === "freq" ? "コピーしました" : "順位計測に追加（コピー）"}
              </Button>
            }
          >
            <DataTable
              rows={frequency}
              columns={freqColumns}
              rowKey={(r) => r.query}
              dense
              minWidth="42rem"
              defaultSort={{ key: "promptCount", dir: "desc" }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
