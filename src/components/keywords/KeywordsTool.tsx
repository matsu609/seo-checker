"use client";

/**
 * キーワード調査（C1）の画面。
 *
 * API キーが 1 つも無くても Google サジェストだけで動く。
 * SERPAPI_KEY / ANTHROPIC_API_KEY が無いときは、その機能のチェックを
 * 無効にして「何が足りないか」を明示する（ダミーは出さない）。
 */
import { useId, useMemo, useState } from "react";
import { Pie, type PieSegment } from "@/components/charts";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
  type Column,
} from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { intentDistribution } from "@/lib/keywords/intent";
import {
  keywordResearchStore,
  keywordSettingsStore,
  removeResearch,
  saveResearch,
} from "@/lib/keywords/store";
import {
  INTENT_DESCRIPTIONS,
  INTENT_LABELS,
  INTENTS,
  JUDGE_LABELS,
  SOURCE_LABELS,
  type KeywordRow,
  type KeywordsResponse,
  type SearchIntent,
} from "@/lib/keywords/types";
import { addKeywords } from "@/lib/rank/store";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { palette } from "@/lib/ui/palette";

const GROUP_OPTIONS = [
  { id: "kana" as const, label: "あ〜ん（46 文字）" },
  { id: "alpha" as const, label: "a〜z（26 文字）" },
  { id: "digit" as const, label: "0〜9（10 文字）" },
];

const INTENT_COLORS: Record<SearchIntent | "unknown", string> = {
  informational: palette.chart[0],
  commercial: palette.chart[2],
  transactional: palette.chart[3],
  navigational: palette.chart[1],
  unknown: palette.chart[4],
};

const INTENT_TONE: Record<SearchIntent, "info" | "pass" | "warn"> = {
  informational: "info",
  commercial: "warn",
  transactional: "pass",
  navigational: "info",
};

function IntentBadge({ row }: { row: KeywordRow }) {
  if (!row.intent) {
    return (
      <Badge tone="neutral" title="ルールで判定できず、AI 分類も行われませんでした">
        未分類
      </Badge>
    );
  }
  return (
    <Badge
      tone={INTENT_TONE[row.intent]}
      icon={false}
      title={`${JUDGE_LABELS[row.judge]}による判定${row.matched ? `／一致: ${row.matched}` : ""}`}
    >
      {INTENT_LABELS[row.intent]}
    </Badge>
  );
}

export function KeywordsTool() {
  const id = useId();
  const { status } = useIntegrations();
  const { project } = useCurrentProject();
  const [settings, setSettings] = useStore(keywordSettingsStore);
  const [history] = useStore(keywordResearchStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  // 「0 件でした」を成功と同じ見た目で出すと、失敗に気づけない
  const [noticeIsFailure, setNoticeIsFailure] = useState(false);
  const [intentFilter, setIntentFilter] = useState<string>("");
  const research = useToolRun<KeywordsResponse>();

  const serpEnabled = status?.serpapi === true;
  const anthropicEnabled = status?.anthropic === true;
  const projectId = project?.id ?? "";

  const mine = useMemo(() => history.filter((h) => h.projectId === projectId), [history, projectId]);
  const current = useMemo(
    () => mine.find((h) => h.id === selectedId) ?? mine[0] ?? null,
    [mine, selectedId],
  );
  const result = current?.result ?? null;

  const rows = useMemo(() => {
    if (!result) return [];
    if (!intentFilter) return result.rows;
    if (intentFilter === "unknown") return result.rows.filter((r) => r.intent === null);
    return result.rows.filter((r) => r.intent === intentFilter);
  }, [result, intentFilter]);

  const distribution = useMemo(() => intentDistribution(result?.rows ?? []), [result]);
  const segments: PieSegment[] = useMemo(
    () => [
      ...INTENTS.map((i) => ({
        label: INTENT_LABELS[i],
        value: distribution[i],
        color: INTENT_COLORS[i],
      })),
      { label: "未分類", value: distribution.unknown, color: INTENT_COLORS.unknown },
    ],
    [distribution],
  );

  const seed = settings.seed.trim();
  const canRun = seed.length > 0;
  const queryCount =
    1 +
    (settings.groups.includes("kana") ? 46 : 0) +
    (settings.groups.includes("alpha") ? 26 : 0) +
    (settings.groups.includes("digit") ? 10 : 0);

  function toggleGroup(group: "kana" | "alpha" | "digit", on: boolean) {
    setSettings({
      ...settings,
      groups: on ? [...new Set([...settings.groups, group])] : settings.groups.filter((g) => g !== group),
    });
  }

  async function run() {
    setNoticeIsFailure(false);
    setNotice(null);
    if (!canRun) return;
    const brandTerms = [project?.name, project?.domain].filter((v): v is string => Boolean(v));
    const data = await research.run("/api/keywords", {
      seed,
      groups: settings.groups,
      useRelated: settings.useRelated && serpEnabled,
      useLlmIntent: settings.useLlmIntent && anthropicEnabled,
      brandTerms,
    });
    if (!data) return;
    const stored = saveResearch(data, projectId);
    setSelectedId(stored.id);
    setChecked(new Set());
    setIntentFilter("");
    setNoticeIsFailure(data.rows.length === 0);
    setNotice(
      data.rows.length === 0
        ? "キーワードを 1 件も取得できませんでした。Google サジェストへの接続がブロックされている可能性があります（社内ネットワークやプロキシ環境で起きます）。時間をおくか、別のネットワークからお試しください。"
        : `${data.rows.length} 件のキーワードを取得しました。`,
    );
  }

  function toggleRow(keyword: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(keyword);
      else next.delete(keyword);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setChecked(on ? new Set(rows.map((r) => r.keyword)) : new Set());
  }

  function registerToRank() {
    if (checked.size === 0) return;
    if (!projectId) {
      setNoticeIsFailure(false);
      setNotice("先に「設定」でプロジェクトを作成してください。順位計測はプロジェクト単位で管理します。");
      return;
    }
    const added = addKeywords(Array.from(checked), { projectId, device: "desktop" });
    setNoticeIsFailure(false);
    setNotice(
      added.length > 0
        ? `${added.length} 件を順位計測のキーワードとして登録しました（重複は除いています）。`
        : "登録できる新しいキーワードがありませんでした（すべて登録済みです）。",
    );
  }

  async function copyChecked() {
    const texts = Array.from(checked);
    if (texts.length === 0) return;
    try {
      await navigator.clipboard.writeText(texts.join("\n"));
      setNoticeIsFailure(false);
      setNotice(`${texts.length} 件をクリップボードにコピーしました。`);
    } catch {
      setNoticeIsFailure(false);
      setNotice("クリップボードにコピーできませんでした。表を選択してコピーしてください。");
    }
  }

  function exportCsv() {
    if (!result) return;
    downloadCsv(
      csvFileName(`keywords-${result.seed}`, new Date()),
      [
        { header: "キーワード", value: (r: KeywordRow) => r.keyword },
        { header: "文字数", value: (r: KeywordRow) => r.chars },
        { header: "検索意図", value: (r: KeywordRow) => (r.intent ? INTENT_LABELS[r.intent] : "未分類") },
        { header: "判定", value: (r: KeywordRow) => JUDGE_LABELS[r.judge] },
        { header: "出所", value: (r: KeywordRow) => r.sources.map((s) => SOURCE_LABELS[s]).join(" / ") },
      ],
      result.rows,
    );
  }

  const columns: Column<KeywordRow>[] = [
    {
      key: "check",
      width: "2.5rem",
      header: (
        <input
          type="checkbox"
          aria-label="表示中のキーワードをすべて選択"
          checked={rows.length > 0 && rows.every((r) => checked.has(r.keyword))}
          onChange={(e) => toggleAll(e.target.checked)}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`${row.keyword} を選択`}
          checked={checked.has(row.keyword)}
          onChange={(e) => toggleRow(row.keyword, e.target.checked)}
        />
      ),
    },
    {
      key: "keyword",
      header: "キーワード",
      accessor: (r) => r.keyword,
      sortable: true,
      render: (r) => <span className="break-all">{r.keyword}</span>,
    },
    { key: "chars", header: "文字数", align: "right", width: "5rem", accessor: (r) => r.chars, sortable: true },
    {
      key: "intent",
      header: "検索意図",
      width: "8rem",
      accessor: (r) => (r.intent ? INTENT_LABELS[r.intent] : "未分類"),
      sortable: true,
      render: (r) => <IntentBadge row={r} />,
    },
    {
      key: "sources",
      header: "出所",
      width: "9rem",
      accessor: (r) => r.sources.join(","),
      sortable: true,
      render: (r) => (
        <span className="text-[12px] text-muted">{r.sources.map((s) => SOURCE_LABELS[s]).join(" / ")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title="調査条件"
        description="種キーワードに「あ〜ん」「a〜z」「0〜9」を付けて Google サジェストを展開します。API キーが無くても動きます。"
        actions={
          <>
            <Button onClick={() => void run()} loading={research.state.phase === "running"} disabled={!canRun}>
              キーワードを調査
            </Button>
            {research.state.phase === "running" && (
              <Button variant="secondary" onClick={research.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <Field
            label="種キーワード"
            htmlFor={`${id}-seed`}
            required
            hint={`このキーワードを起点に ${queryCount} 回サジェストを取得します。`}
          >
            <Input
              id={`${id}-seed`}
              value={settings.seed}
              onChange={(e) => setSettings({ ...settings, seed: e.target.value })}
              placeholder="例: llmo 対策"
            />
          </Field>
          <fieldset className="min-w-0">
            <legend className="mb-1 block text-[13px] font-bold text-ink">展開する文字</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[13px] text-ink">
              {GROUP_OPTIONS.map((g) => (
                <label key={g.id} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.groups.includes(g.id)}
                    onChange={(e) => toggleGroup(g.id, e.target.checked)}
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-4 grid gap-2 border-t border-line pt-4 text-[13px] text-ink">
          <label className="flex items-start gap-1.5">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={settings.useRelated && serpEnabled}
              disabled={!serpEnabled}
              onChange={(e) => setSettings({ ...settings, useRelated: e.target.checked })}
            />
            <span className="min-w-0">
              関連キーワード・「他の人はこちらも質問」も取得する
              {!serpEnabled && (
                <span className="text-[12px] text-muted">（SERPAPI_KEY が未設定のため使えません）</span>
              )}
            </span>
          </label>
          <label className="flex items-start gap-1.5">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={settings.useLlmIntent && anthropicEnabled}
              disabled={!anthropicEnabled}
              onChange={(e) => setSettings({ ...settings, useLlmIntent: e.target.checked })}
            />
            <span className="min-w-0">
              ルールで決まらない検索意図を AI で分類する
              {!anthropicEnabled && (
                <span className="text-[12px] text-muted">（ANTHROPIC_API_KEY が未設定のため使えません）</span>
              )}
            </span>
          </label>
        </div>
        {notice &&
          (noticeIsFailure ? (
            <div className="mt-3">
              <Callout tone="warn" title="キーワードを取得できませんでした">
                {notice}
              </Callout>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-muted">{notice}</p>
          ))}
      </Card>

      {research.state.phase === "error" && (
        <Callout tone="fail" title="調査できませんでした">
          {research.state.message}
        </Callout>
      )}

      {!result ? (
        <EmptyState
          title="まだ調査結果がありません"
          description="種キーワードを入力して「キーワードを調査」を押してください。Google サジェストは公開エンドポイントなので、API キーが無くても展開できます。"
        />
      ) : (
        <>
          <Card
            title="調査結果"
            description={`種キーワード: ${result.seed}`}
            actions={
              <>
                {mine.length > 1 && (
                  <Select
                    aria-label="過去の調査結果"
                    value={current?.id ?? ""}
                    onChange={(e) => {
                      setSelectedId(e.target.value);
                      setChecked(new Set());
                    }}
                    className="h-9 w-64 text-sm"
                  >
                    {mine.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.result.seed}／{new Date(h.result.fetchedAt).toLocaleString("ja-JP")}
                      </option>
                    ))}
                  </Select>
                )}
                <Button variant="secondary" size="sm" onClick={exportCsv}>
                  CSV ダウンロード
                </Button>
                {current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      removeResearch(current.id);
                      setSelectedId(null);
                      setChecked(new Set());
                    }}
                  >
                    削除
                  </Button>
                )}
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="キーワード数" value={result.rows.length} unit="件" />
              <StatCard
                label="サジェスト取得"
                value={`${result.suggest.succeeded} / ${result.suggest.queries}`}
                hint={`${result.suggest.keywords} 件を取得`}
              />
              <StatCard
                label="関連・PAA"
                value={result.related.enabled ? result.related.relatedSearches + result.related.relatedQuestions : "—"}
                unit={result.related.enabled ? "件" : undefined}
                hint={result.related.enabled ? "SERP から取得" : "SERPAPI_KEY が未設定"}
              />
              <StatCard
                label="未分類"
                value={result.intent.unknownCount}
                unit="件"
                hint={`ルール ${result.intent.ruleCount} 件／AI ${result.intent.llmCount} 件`}
              />
            </div>

            {result.notes.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-sm border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
                {result.notes.map((n, i) => (
                  <li key={`${n.kind}-${i}`}>{n.message}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="検索意図の内訳" description="ルール（とは / 比較 / 料金 など）で判定し、残りを AI が分類します。">
            <Pie segments={segments} centerSub="キーワード" ariaLabel="検索意図の内訳" />
            <dl className="mt-4 grid gap-x-6 gap-y-1 text-[12px] leading-relaxed text-muted sm:grid-cols-2">
              {INTENTS.map((i) => (
                <div key={i} className="flex gap-2">
                  <dt className="shrink-0 font-bold text-ink">{INTENT_LABELS[i]}</dt>
                  <dd>{INTENT_DESCRIPTIONS[i]}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card
            title="キーワード一覧"
            description="チェックしたキーワードは順位計測に登録するか、クリップボードにコピーできます。"
            actions={
              <>
                <Select
                  aria-label="検索意図で絞り込む"
                  value={intentFilter}
                  onChange={(e) => setIntentFilter(e.target.value)}
                  className="h-9 w-40 text-sm"
                >
                  <option value="">すべての意図</option>
                  {INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {INTENT_LABELS[i]}
                    </option>
                  ))}
                  <option value="unknown">未分類</option>
                </Select>
                <Button variant="secondary" size="sm" onClick={() => void copyChecked()} disabled={checked.size === 0}>
                  選択をコピー
                </Button>
                <Button size="sm" onClick={registerToRank} disabled={checked.size === 0}>
                  順位計測に登録（{checked.size}）
                </Button>
              </>
            }
          >
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.keyword}
              minWidth="34rem"
              emptyText="条件に合うキーワードがありません。"
            />
          </Card>
        </>
      )}
    </div>
  );
}
