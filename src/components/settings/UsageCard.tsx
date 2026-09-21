"use client";

/**
 * 今月の利用回数（設定画面）。実費の出る機能の「使った / 上限」を、お客様本人に見せる。
 *
 * 上限で止まったときに「なぜ止まったか」が分かるように、止まる前から残りを見せておく
 * （利用者の決定 2026-09-21: 1 店舗の原価を 3,000 円以内に）。金額は出さない。
 */
import { useEffect, useState } from "react";
import type { UsageResponse } from "@/app/api/usage/route";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

export function UsageCard() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/usage", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as UsageResponse;
      })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const resets = data ? formatDate(data.resetsOn) : "";

  return (
    <Card
      title="今月の利用回数"
      description="外部のサービス（AI・検索結果・地図）を使う機能には月の上限があります。上限に達した機能は翌月 1 日に戻ります。毎週の自動計測・自動更新は別枠です。"
    >
      {error && <p className="text-[13px] text-muted">利用回数を取得できませんでした。</p>}
      {!error && data === null && <p className="text-[13px] text-muted">確認中…</p>}
      {data && !data.available && <p className="text-[13px] text-muted">まだ利用回数を数えていません（保存先が未設定です）。</p>}
      {data?.available && (
        <>
          {data.staff && (
            <p className="mb-3 text-[12px] text-muted">
              <Badge tone="neutral" icon={false}>
                運用者
              </Badge>{" "}
              上限はありません（回数は参考）。
            </p>
          )}
          <ul className="divide-y divide-line border-y border-line">
            {data.items.map((it) => {
              const over = it.limit !== null && it.used >= it.limit;
              const near = it.limit !== null && !over && it.used >= it.limit * 0.8;
              return (
                <li key={it.key} className="grid gap-x-4 gap-y-1 py-2.5 @xl:grid-cols-[1fr_220px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-ink">{it.label}</span>
                      {over && <Badge tone="fail">上限に達しました（{resets} に戻ります）</Badge>}
                      {near && <Badge tone="warn">残りが少ない</Badge>}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted">{it.counts}</p>
                  </div>
                  <div className="self-center">
                    <div className="mb-1 flex items-baseline justify-between text-[12px] tabular-nums">
                      <span className="text-ink">
                        {it.used.toLocaleString("ja-JP")}
                        <span className="text-muted"> / {it.limit === null ? "無制限" : `${it.limit.toLocaleString("ja-JP")} ${it.unit}`}</span>
                      </span>
                      {it.limit !== null && <span className="text-muted">あと {Math.max(0, it.limit - it.used).toLocaleString("ja-JP")}</span>}
                    </div>
                    {it.limit !== null && <ProgressBar value={Math.min(it.used, it.limit)} max={it.limit} />}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-muted">{data.month.replace("-", " 年 ")} 月分。{resets} に全部戻ります。</p>
        </>
      )}
    </Card>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}
