"use client";

/**
 * 外部からの評価（旧・ドメインパワー）のカード。
 *
 * 利用者の決定（2026-09-19）「打ち手のある項目だけを採点する」により、
 * 0〜100 の総合点とグレードをやめ、**こちらが動かせる 2 つ**だけを出す。
 * 各指標には必ず「次にやること」を添える（動けない数字は載せない）。
 * 他社の「ドメインパワー測定サイト」と同じ数値（Ahrefs の DR・Open PageRank）は
 * 比較のために残す。
 */
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { AHREFS_ATTRIBUTION, AHREFS_URL } from "@/lib/domain-power/ahrefs";
import { SIGNAL_ACTIONS, SIGNAL_SOURCES, SIGNAL_STATUS_LABELS, type DomainPowerResult, type SignalStatus } from "@/lib/domain-power/types";

const STATUS_TONE: Record<SignalStatus, "pass" | "warn" | "info" | "neutral"> = {
  good: "pass",
  fair: "warn",
  // 「弱い（赤）」にしない: 中小企業のサイトで DR 0 は普通で、赤くしても動けないため
  poor: "info",
  unknown: "neutral",
};

/** 指標ごとの「次にやること」から飛ばす画面 */
const ACTION_LINKS: Record<string, { href: string; label: string } | undefined> = {
  links: { href: "/tools/citations", label: "サイテーション調査を開く" },
  index: { href: "/tools/seo-analysis", label: "課題一覧でインデックスの問題を見る" },
};

export function DomainPowerCard({ domain }: { domain: DomainPowerResult }) {
  return (
    <Card
      title="外部からの評価"
      description="サイトの外側（よそのサイトからのリンク、Google への登録状況）からの評価です。ここに出すのは、こちらの施策で動かせる項目だけに絞っています。総合点は出しません（点数そのものを操作することはできないため）。"
      printCard
    >
      <ul className="divide-y divide-line border-y border-line">
        {domain.signals.map((s) => {
          const link = ACTION_LINKS[s.id];
          return (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[s.status]} icon={STATUS_TONE[s.status] !== "neutral"}>
                  {SIGNAL_STATUS_LABELS[s.status]}
                </Badge>
                <span className="text-sm font-bold text-ink">{s.label}</span>
                <span className="text-[20px] font-bold tabular-nums text-ink">{s.value}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.detail}</p>
              {s.status !== "unknown" && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink">
                  <span className="font-bold">次にやること: </span>
                  {SIGNAL_ACTIONS[s.id]}
                  {link && (
                    <Link href={link.href} className="ml-1 whitespace-nowrap text-accent underline-offset-2 hover:underline no-print">
                      {link.label}
                    </Link>
                  )}
                </p>
              )}
              <p className="mt-1 text-[11px] leading-relaxed text-muted">出どころ: {SIGNAL_SOURCES[s.id]}</p>
            </li>
          );
        })}
      </ul>

      {(domain.ahrefsDr !== null || domain.openPageRank !== null) && (
        <div className="mt-5 rounded-sm border border-line bg-surface p-4">
          <h3 className="text-sm font-bold text-ink">よく使われる無料ツールと同じ指標</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            他社の「ドメインパワー測定サイト」が出しているのと同じ数値です。突き合わせるときはこちらを見てください。
          </p>
          <div className="mt-3 grid gap-3 @xl:grid-cols-2">
            {domain.ahrefsDr !== null && (
              <div className="rounded-sm border border-line bg-panel px-4 py-3">
                <div className="text-[11px] text-muted">Domain Rating（DR）</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[22px] font-bold leading-none tabular-nums text-ink">{domain.ahrefsDr.toFixed(0)}</span>
                  <span className="text-[11px] text-muted">/ 100</span>
                </div>
                {/*
                  Ahrefs の利用条件: DR を出すところには必ず「Domain Rating by Ahrefs」と
                  ahrefs.com への機能するリンクを、隠さず消さずに置く。PDF は画面を画像に
                  しているためリンクが押せないので、URL も文字で並べる（消さないこと）。
                */}
                <div className="mt-1 text-[11px] text-muted">
                  <a href={AHREFS_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                    {AHREFS_ATTRIBUTION}
                  </a>
                  <span className="ml-1 break-all">（{AHREFS_URL}）</span>
                </div>
              </div>
            )}
            {domain.openPageRank !== null && (
              <div className="rounded-sm border border-line bg-panel px-4 py-3">
                <div className="text-[11px] text-muted">Open PageRank</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[22px] font-bold leading-none tabular-nums text-ink">{domain.openPageRank.toFixed(2)}</span>
                  <span className="text-[11px] text-muted">/ 10</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {domain.openPageRankWorldRank ? `世界順位 ${domain.openPageRankWorldRank.toLocaleString("ja-JP")} 位` : "Common Crawl のリンクグラフ"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {domain.peers.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-ink">競合との比較</h3>
          <p className="mb-2 text-[11px] text-muted">
            競合サイトはクロールしていないため、外に公開されている指標だけで比べています。登録からの年数は採点には使っていません（待つしかないため）。新しいドメインほど、リンクが積み上がるまで時間がかかります。
          </p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="py-1.5 pr-2 font-normal">ドメイン</th>
                <th className="py-1.5 pr-2 text-right font-normal">DR（0〜100）</th>
                <th className="py-1.5 pr-2 text-right font-normal">Open PageRank（0〜10）</th>
                <th className="py-1.5 text-right font-normal">登録からの年数</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-1.5 pr-2 font-bold text-ink">{domain.host}（自社）</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{domain.ahrefsDr === null ? "—" : domain.ahrefsDr.toFixed(0)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{domain.openPageRank === null ? "—" : domain.openPageRank.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">{domain.ageYears === null ? "—" : `${domain.ageYears.toFixed(1)} 年`}</td>
              </tr>
              {domain.peers.map((p) => (
                <tr key={p.host} className="border-b border-line">
                  <td className="py-1.5 pr-2 break-all text-muted">{p.host}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{p.ahrefsDr === null ? "—" : p.ahrefsDr.toFixed(0)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{p.openPageRank === null ? "—" : p.openPageRank.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{p.ageYears === null ? "—" : `${p.ageYears.toFixed(1)} 年`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {domain.notes.length > 0 && <p className="mt-3 text-[11px] leading-relaxed text-muted">{domain.notes.join(" ／ ")}</p>}
    </Card>
  );
}
