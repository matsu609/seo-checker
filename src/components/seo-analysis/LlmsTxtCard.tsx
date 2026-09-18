"use client";

/**
 * llms.txt（AI 向けの案内ファイル）の評価カード。
 *
 * まず「ある / ない」を大きく出し、あるときだけ中身の判定を並べる。
 * 判定の基準は生成ツール（/tools/llms-txt）と同じ `validateLlmsTxt`。
 */
import { Badge, Callout, Card } from "@/components/ui";
import { llmsAdvice, type LlmsAdviceInput } from "@/lib/seo-analysis/llms-advice";
import type { SheetLlmsTxt } from "@/lib/seo-analysis/sheet/types";

const LEVEL_LABELS = { pass: "合格", warn: "注意", fail: "未対応" } as const;

export function LlmsTxtCard({ llms, site }: { llms: SheetLlmsTxt; site?: LlmsAdviceInput | null }) {
  const checks = llms.checks.filter((c) => c.id !== "exists");
  const advice = llmsAdvice(llms, site ?? {});
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.level] += 1;

  return (
    <Card
      title="llms.txt（AI 向けの案内ファイル）"
      description="ChatGPT や Google の AI 検索がサイトを読むときの案内になるテキストファイルです。サイトのルートに置くと、どのページが何のためのページかを自分の言葉で伝えられます。まだ必須ではありませんが、置いていないサイトの方が多いぶん差がつきます。"
      printCard
      actions={
        llms.present ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="pass" icon={false}>合格 {counts.pass}</Badge>
            <Badge tone="warn" icon={false}>注意 {counts.warn}</Badge>
            <Badge tone="fail" icon={false}>未対応 {counts.fail}</Badge>
          </div>
        ) : null
      }
    >
      {llms.present ? (
        <>
          <div className="grid gap-3 @2xl:grid-cols-3">
            <Stat label="llms.txt" value="あり" hint={`${llms.length.toLocaleString("ja-JP")} 文字 / ${Math.round((llms.bytes / 1024) * 10) / 10} KB`} tone="pass" />
            <Stat label="案内しているページ" value={`${llms.linkCount}`} hint={`うち説明つき ${llms.describedLinks} 件`} />
            <Stat
              label="llms-full.txt"
              value={llms.full.present ? "あり" : "なし"}
              hint={llms.full.present ? `${llms.full.length.toLocaleString("ja-JP")} 文字` : "本文をまとめた大きい方。llms.txt だけでも成立します"}
            />
          </div>

          {(llms.title || llms.summary || llms.sections.length > 0) && (
            <dl className="mt-4 space-y-1.5 text-[13px] leading-relaxed">
              {llms.title && <Row term="サイト名" desc={llms.title} />}
              {llms.summary && <Row term="概要" desc={llms.summary} />}
              {llms.sections.length > 0 && <Row term="セクション" desc={llms.sections.join(" / ")} />}
            </dl>
          )}

          <ul className="mt-4 divide-y divide-line border-y border-line">
            {checks.map((c) => (
              <li key={c.id} className="grid gap-x-4 gap-y-1 py-2.5 text-[13px] @xl:grid-cols-[5rem_10rem_1fr] @xl:items-start">
                <div>
                  <Badge tone={c.level}>{LEVEL_LABELS[c.level]}</Badge>
                </div>
                <div className="font-bold text-ink">{c.label}</div>
                <div className="leading-relaxed text-muted">{c.detail}</div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            リンク先が生きているかの確認は、この診断では行っていません（サイドバーの「llms.txt 生成」の検証タブでできます）。
          </p>
        </>
      ) : (
        <Callout tone="warn" title="llms.txt はまだありません">
          <p className="leading-relaxed">
            <code className="font-mono">{llms.url}</code> を取得できませんでした（HTTP {llms.status || "接続失敗"}）。
            サイドバーの「llms.txt 生成」でサイトを走査して下書きを作り、サイトのルートに置けます。
            {llms.full.present && " なお llms-full.txt は見つかりました。目次にあたる llms.txt も置くと、AI が全文を読む前に構成を把握できます。"}
          </p>
        </Callout>
      )}

      {advice.length > 0 && (
        <section className="mt-5" aria-labelledby="llms-advice-heading">
          <h3 id="llms-advice-heading" className="text-[13px] font-bold text-ink">
            {llms.present ? "追加・修正すべきもの" : "このサイトの llms.txt に書くべきもの"}
            <span className="ml-2 font-normal text-muted">クロールで分かったページ構成から、載せるべきページを URL つきで挙げています</span>
          </h3>
          <ol className="mt-2 space-y-3">
            {advice.map((item, i) => (
              <li key={item.title} className="rounded-sm border border-line px-4 py-3 text-[13px]">
                <div className="flex gap-2">
                  <span className="shrink-0 font-bold tabular-nums text-accent">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{item.title}</p>
                    <p className="mt-1 leading-relaxed text-muted">{item.detail}</p>
                    {item.pages && item.pages.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {item.pages.map((p) => (
                          <li key={p.url} className="truncate">
                            <span className="text-ink">{p.title || p.url}</span>
                            <span className="ml-2 font-mono text-[11px] text-muted">{p.url}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Card>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "pass" }) {
  return (
    <div className="rounded-sm border border-line px-4 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] font-bold leading-none tabular-nums text-ink">{value}</span>
        {tone && <Badge tone={tone}>検出</Badge>}
      </div>
      <div className="mt-1 text-[11px] text-muted">{hint}</div>
    </div>
  );
}

function Row({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="grid gap-x-4 @xl:grid-cols-[6rem_1fr]">
      <dt className="text-[11px] font-bold text-muted @xl:pt-0.5">{term}</dt>
      <dd className="text-ink">{desc}</dd>
    </div>
  );
}
