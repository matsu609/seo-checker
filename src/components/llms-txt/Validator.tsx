"use client";

/**
 * 既存 llms.txt の検証。
 * ウィザードとは独立して使えるので、生成前でも「今どうなっているか」を確認できる。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, DataTable, EmptyState, Field, Input, type Column } from "@/components/ui";
import type { CheckLevel, LlmsLink, ValidationCheck, ValidationResult } from "@/lib/llms-txt/types";
import { useToolRun } from "@/lib/tools/run";

const LEVEL_TONE: Record<CheckLevel, "pass" | "warn" | "fail"> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
};

const LEVEL_LABEL: Record<CheckLevel, string> = {
  pass: "問題なし",
  warn: "確認",
  fail: "要対応",
};

const CHECK_COLUMNS: Column<ValidationCheck>[] = [
  { key: "label", header: "確認項目", width: "12rem", render: (r) => <span className="font-bold text-ink">{r.label}</span> },
  {
    key: "level",
    header: "判定",
    width: "7rem",
    nowrap: true,
    render: (r) => <Badge tone={LEVEL_TONE[r.level]}>{LEVEL_LABEL[r.level]}</Badge>,
  },
  { key: "detail", header: "内容", render: (r) => <span className="break-all text-muted">{r.detail}</span> },
];

const LINK_COLUMNS: Column<LlmsLink>[] = [
  { key: "title", header: "タイトル", width: "14rem", render: (r) => <span className="text-ink">{r.title || "—"}</span> },
  {
    key: "url",
    header: "URL",
    render: (r) => (
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
        {r.url}
      </a>
    ),
  },
  { key: "section", header: "セクション", width: "9rem", render: (r) => <span className="text-muted">{r.section || "—"}</span> },
  {
    key: "status",
    header: "状態",
    width: "7rem",
    nowrap: true,
    sortable: true,
    accessor: (r) => r.status ?? 999,
    render: (r) =>
      r.status === null ? (
        <span className="text-muted">未確認</span>
      ) : r.status === 0 ? (
        <Badge tone="fail">接続不可</Badge>
      ) : r.status >= 400 ? (
        <Badge tone="fail">HTTP {r.status}</Badge>
      ) : (
        <Badge tone="pass">HTTP {r.status}</Badge>
      ),
  },
];

export function LlmsTxtValidator({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const { state, run } = useToolRun<{ validation: ValidationResult; cached: boolean }>();
  const validation = state.phase === "done" ? state.data.validation : null;
  const running = state.phase === "running";

  return (
    <Card
      title="既存の llms.txt を検証する"
      description="公開中の llms.txt を取得して、形式・サイズ・リンク切れを確認します。生成前の現状把握にも使えます。"
    >
      <form
        className="grid gap-3 @2xl:grid-cols-[1fr_auto] @2xl:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void run("/api/llms-txt/validate", { url, checkLinks: true });
        }}
      >
        <Field label="サイトまたは llms.txt の URL" htmlFor="llms-validate-url" hint="サイトの URL を入れると /llms.txt を見に行きます">
          <Input
            id="llms-validate-url"
            value={url}
            inputMode="url"
            placeholder="https://example.co.jp/"
            disabled={running}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={running} disabled={!url.trim()}>
          検証する
        </Button>
      </form>

      {state.phase === "error" && (
        <Callout tone="fail" title="検証できませんでした" className="mt-4">
          {state.message}
        </Callout>
      )}

      {validation && (
        <div className="mt-5 space-y-5">
          {!validation.present ? (
            <EmptyState
              title="llms.txt が見つかりませんでした"
              description={`${validation.url} を取得できませんでした。上のウィザードで作成し、サイトのルートに置いてください。`}
            />
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-1 text-[13px] @2xl:grid-cols-3">
                <div className="flex gap-2">
                  <dt className="text-muted">サイト名</dt>
                  <dd className="min-w-0 text-ink">{validation.title ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted">セクション</dt>
                  <dd className="text-ink">{validation.sections.length} 件</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted">リンク</dt>
                  <dd className="text-ink">
                    {validation.links.length} 件
                    {validation.deadLinks !== null && validation.deadLinks > 0 && (
                      <span className="ml-1 text-fail">（切れ {validation.deadLinks} 件）</span>
                    )}
                  </dd>
                </div>
              </dl>

              <DataTable rows={validation.checks} columns={CHECK_COLUMNS} rowKey={(r) => r.id} dense minWidth="38rem" />

              {validation.links.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">記載されているリンク</h3>
                  <DataTable rows={validation.links} columns={LINK_COLUMNS} rowKey={(r) => r.url} dense minWidth="40rem" />
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-[13px] text-accent">取得した llms.txt を表示</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink">
                  {validation.raw}
                </pre>
              </details>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
