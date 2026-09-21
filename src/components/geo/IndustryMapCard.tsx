"use client";

/**
 * 業界の地図（LLM Mentions。残タスク #127。利用者の指示 2026-09-21「126 を実装してください」）。
 *
 * **いまの計測との違い**: ダッシュボードの他のグラフは「自社が登録したプロンプト / キーワードで
 * どれだけ出たか」。このカードは「その話題の AI 回答で、**世の中のどのサイトが**引用されているか」。
 * 自分が測っていない競合やメディアも出るので、競合比較の地図として使う。
 *
 * 1 回引くたびに費用がかかる（行数課金）ので、**ボタンを押したときだけ**取りに行く。
 * 定期実行には入れない。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, Field, Input, StatCard } from "@/components/ui";
import { HBar, type HBarRow } from "@/components/charts";
import { palette } from "@/lib/ui/palette";
import { MENTION_PLATFORM_LABELS, MENTION_PLATFORMS, type MentionPlatform } from "@/lib/geo/types";
import { runIndustryMap, type IndustryMapResponse, type IndustryMapRow } from "./client";

/** 業界の地図 1 回のクレジット（credits.ts の CREDIT_RATES と合わせる） */
const CREDITS_PER_RUN = 5;

export interface IndustryMapCardProps {
  balance: number;
  /** 設定の対策キーワード。入力欄の初期値と候補に使う */
  keywords: readonly string[];
  /** 実行後にダッシュボードを読み直す（クレジット残高が変わるため） */
  onRan?: () => void;
}

/** 棒の色。自社 → 競合 → その他 の順に目立たせる */
export function barColor(row: IndustryMapRow): string {
  if (row.isOwn) return palette.chart[0];
  if (row.isCompetitor) return palette.chart[3];
  return palette.chart[4];
}

export function IndustryMapCard({ balance, keywords, onRan }: IndustryMapCardProps) {
  const [keyword, setKeyword] = useState(keywords[0] ?? "");
  const [platform, setPlatform] = useState<MentionPlatform>("google");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IndustryMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enough = balance >= CREDITS_PER_RUN;
  const rows = result?.report?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.mentions));
  const bars: HBarRow[] = rows.map((row, i) => ({
    label: row.domain,
    value: row.mentions,
    max,
    color: barColor(row),
    sublabel: row.aiSearchVolume === null ? `${i + 1} 位` : `${i + 1} 位・AI 検索ボリューム ${row.aiSearchVolume.toLocaleString("ja-JP")}`,
    valueLabel: (
      <span className={row.isOwn ? "text-ink" : "text-muted"}>{row.mentions.toLocaleString("ja-JP")}</span>
    ),
  }));

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const next = await runIndustryMap(keyword.trim(), platform);
      setResult(next);
      if (next.ok) onRan?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="業界の地図（AI の回答で引用されているサイト）"
      description="トピックを 1 つ入れると、その話題の AI 回答で引用が多いサイトの順位表が出ます。自分が登録していない競合やメディアも出るので、「この業界では誰が引用されているか」を確かめるのに使います。押したときだけ取りに行きます（定期計測には入りません）。"
      printCard
      actions={<Badge tone={enough ? "neutral" : "warn"} icon={false}>1 回 {CREDITS_PER_RUN} クレジット・残り {balance}</Badge>}
    >
      {error && (
        <Callout tone="fail" className="mb-3">
          {error}
        </Callout>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="トピック（業界を表す言葉）" className="min-w-[16rem] flex-1">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="SEO ツール"
            list="geo-industry-keywords"
          />
          <datalist id="geo-industry-keywords">
            {keywords.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label="どこの AI か">
          <select
            className="rounded-sm border border-line bg-panel px-3 py-2 text-[13px] text-ink"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as MentionPlatform)}
          >
            {MENTION_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {MENTION_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Button size="sm" loading={busy} disabled={!keyword.trim() || !enough} onClick={() => void run()}>
          調べる
        </Button>
      </div>

      {keywords.length === 0 && (
        <p className="mt-2 text-[11px] text-muted">
          設定の「対策キーワード」を登録すると、ここの候補に出ます。
        </p>
      )}
      {!enough && (
        <p className="mt-2 text-[11px] text-warn">
          クレジットが足りません（必要 {CREDITS_PER_RUN}）。翌月のリセットまで待つか、定期計測の本数を見直してください。
        </p>
      )}

      {result && !result.ok && (
        <Callout tone="warn" className="mt-3">
          {result.message}
        </Callout>
      )}

      {result?.ok && result.report && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 @2xl:grid-cols-3">
            <StatCard
              label="自社の順位"
              value={result.report.ownRank === null ? "圏外" : `${result.report.ownRank}`}
              unit={result.report.ownRank === null ? undefined : "位"}
              hint={result.report.ownRank === null ? `上位 ${rows.length} 件に自社のドメインは出ていません` : `${rows.length} 件中`}
            />
            <StatCard label="取得したサイト" value={rows.length} unit="件" hint="引用の多い順" />
            <StatCard
              label="この話題の言及の総数"
              value={result.report.totalCount === null ? "—" : result.report.totalCount.toLocaleString("ja-JP")}
              hint={result.report.totalCount === null ? "この条件では返りませんでした" : "DataForSEO が持っている件数"}
            />
          </div>

          <HBar rows={bars} max={max} ticks={[]} valueTone="none" labelWidth="14rem" ariaLabel="引用されているサイトの順位表" legend={false} />

          <p className="text-[11px] leading-relaxed text-muted">
            <span aria-hidden style={{ color: palette.chart[0] }}>■</span> 自社{"　"}
            <span aria-hidden style={{ color: palette.chart[3] }}>■</span> 登録済みの競合{"　"}
            <span aria-hidden style={{ color: palette.chart[4] }}>■</span> その他のサイト
            <br />
            自社・競合の印は、設定（/settings）に登録したドメインと照らして付けています。
            この数字は<strong className="font-bold">DataForSEO が集めた「世の中の AI 回答」</strong>のもので、
            上のグラフ（自分で登録したプロンプト・キーワードの計測）とは母集団が違います。並べて足し引きはできません。
          </p>
        </div>
      )}
    </Card>
  );
}
