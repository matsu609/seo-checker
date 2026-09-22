"use client";

/**
 * AI クローラーの受け入れ状態（利用者の指示 2026-09-22 の ④）。
 *
 * **「来たか」ではなく「来られるか」を出す。**訪問回数はお客様のサイトの
 * アクセスログが要る。うちは 2026-09-17 に「お客様側の作業が要る機能は置かない」
 * と決め、r90 で自前の計測タグも取り下げているので、その線には戻らない。
 * 名前もそれに合わせて「訪問数」とは呼ばない。
 *
 * 判定は robots.txt を読むだけなので **API の費用はゼロ**。開いたときに 1 回だけ取る。
 */
import { useEffect, useState } from "react";
import { Badge, Button, Callout, Card } from "@/components/ui";
import { PURPOSE_LABELS, type BotPurpose } from "@/lib/page-report/robots";

interface BotRow {
  ua: string;
  vendor: string;
  purpose: BotPurpose;
  note: string;
  allowed: boolean;
  reason: string;
}

interface CrawlerResponse {
  origin: string;
  checkedAt: string;
  exists: boolean;
  bots: BotRow[];
  blocked: Record<BotPurpose, number>;
}

/** 検索用は「AI の回答に載るかどうか」に直結するので先に出す */
const PURPOSE_ORDER: BotPurpose[] = ["search", "user", "training"];

export function CrawlerCard() {
  const [data, setData] = useState<CrawlerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // 効果の中で同期に setState しない（読み込み中の印は「再確認」を押した側で立てる）
    fetch("/api/geo/crawlers", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (CrawlerResponse & { error?: string }) | null;
        if (!alive) return;
        if (!res.ok || !body) {
          setError(body?.error ?? "読み込めませんでした");
          setData(null);
          return;
        }
        setData(body);
        setError(null);
      })
      .catch(() => {
        if (alive) setError("読み込めませんでした");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const blockedSearch = data?.blocked?.search ?? 0;

  return (
    <Card
      title="AI クローラーの受け入れ状態"
      description="AI 各社のクローラーが、あなたのサイトを取得できる設定になっているかです（robots.txt を読んでいます）。拒否していると、そもそも AI の回答に載りません。"
      printCard
      actions={
        <Button
          size="sm"
          variant="secondary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTick((t) => t + 1);
          }}
        >
          再確認
        </Button>
      }
    >
      {error ? (
        <Callout tone="warn">{error}</Callout>
      ) : loading && !data ? (
        <p className="text-[13px] text-muted">読み込んでいます…</p>
      ) : data ? (
        <>
          {!data.exists && (
            <Callout tone="info" className="mb-3" title="robots.txt がありません">
              ファイルが無い場合、クローラーは「取得してよい」と解釈します。いまは全社が取得できる状態です。
            </Callout>
          )}
          {blockedSearch > 0 && (
            <Callout tone="fail" className="mb-3" title={`検索用のクローラーを ${blockedSearch} 件拒否しています`}>
              この設定のままだと、拒否している AI の回答には載りません。意図した設定かご確認ください。
            </Callout>
          )}

          <ul className="divide-y divide-line border-y border-line">
            {PURPOSE_ORDER.flatMap((purpose) => data.bots.filter((b) => b.purpose === purpose)).map((bot) => (
              <li key={bot.ua} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                <Badge tone={bot.allowed ? "pass" : "fail"} icon={false}>
                  {bot.allowed ? "許可" : "拒否"}
                </Badge>
                <span className="font-bold text-ink">{bot.ua}</span>
                <span className="text-[11px] text-muted">{bot.vendor}</span>
                <Badge tone="neutral" icon={false}>
                  {PURPOSE_LABELS[bot.purpose]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{bot.note}</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {data.origin} の robots.txt を {new Date(data.checkedAt).toLocaleString("ja-JP")} に確認しました。
            <strong className="font-bold">これは「来られる状態か」であって「実際に来た回数」ではありません。</strong>
            訪問回数はサイトのアクセスログが必要で、このツールでは測れません（お客様側の設置作業が要る機能は置かない方針のため）。
            学習用を断りつつ検索用は許可する、という選び方もできます。
          </p>
        </>
      ) : null}
    </Card>
  );
}
