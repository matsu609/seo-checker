import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainsCard, FilterBar, KeywordOutcomesCard, RecentOutputsCard, ScheduleBanner, SectionHeading } from "../DashboardParts";
import type { KeywordOutcomeSummary } from "@/lib/geo/aggregate";
import type { RecentOutputView } from "../client";

const NOW = new Date("2026-09-22T00:00:00Z");

describe("ScheduleBanner（次回 / 最終実行）", () => {
  it("次回と最終実行を「あと N 時間」で出す", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleBanner, {
        schedule: { nextRunAt: "2026-09-22T20:00:00Z", lastRunAt: "2026-09-21T20:00:00Z", enabled: true },
        now: NOW,
      }),
    );
    expect(html).toContain("自動実行スケジュール");
    expect(html).toContain("有効");
    expect(html).toContain("20 時間");
    expect(html).toContain("4 時間");
  });

  it("まだ 1 回も動いていないときは「まだありません」（0 時間前と言わない）", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleBanner, { schedule: { nextRunAt: "2026-09-22T20:00:00Z", lastRunAt: null, enabled: true }, now: NOW }),
    );
    expect(html).toContain("まだありません");
  });

  it("止まっているときは有効と言わない", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleBanner, { schedule: { nextRunAt: "2026-09-22T20:00:00Z", lastRunAt: null, enabled: false }, now: NOW }),
    );
    expect(html).toContain("停止中");
  });
});

describe("FilterBar", () => {
  const base = { value: {}, tags: ["比較", "指名"], models: ["chatgpt", "gemini"] as const, onChange: () => {} };

  it("モデル・タグ・期間を選べる", () => {
    const html = renderToStaticMarkup(createElement(FilterBar, { ...base, models: [...base.models] }));
    expect(html).toContain("すべてのモデル");
    expect(html).toContain("すべてのタグ");
    expect(html).toContain("直近 4 週間");
    expect(html).toContain("比較");
  });

  it("観測のあるモデルだけを並べる（測っていないモデルを出さない）", () => {
    const html = renderToStaticMarkup(createElement(FilterBar, { ...base, models: ["chatgpt"] }));
    expect(html).toContain("ChatGPT");
    expect(html).not.toContain("Perplexity");
  });

  it("タグが無ければタグの選択を触らせない", () => {
    const html = renderToStaticMarkup(createElement(FilterBar, { ...base, models: [...base.models], tags: [] }));
    expect(html).toContain("disabled");
  });

  it("既定から動かしたときだけ「条件を戻す」を出す", () => {
    expect(renderToStaticMarkup(createElement(FilterBar, { ...base, models: [...base.models] }))).not.toContain("条件を戻す");
    const html = renderToStaticMarkup(createElement(FilterBar, { ...base, models: [...base.models], value: { model: "chatgpt" } }));
    expect(html).toContain("条件を戻す");
  });

  it("期間を既定から変えたら、数字が読みにくくなることを断る", () => {
    const html = renderToStaticMarkup(createElement(FilterBar, { ...base, models: [...base.models], value: { days: 7 } }));
    expect(html).toContain("観測が減り");
  });
});

function output(over: Partial<RecentOutputView> = {}): RecentOutputView {
  return {
    measurementId: "m1",
    text: "おすすめの SEO ツールは？",
    responseText: "A社やB社が有名です。".repeat(20),
    model: "chatgpt",
    executedAt: "2026-09-21T20:00:00Z",
    promptId: "p1",
    keywordId: null,
    mentioned: true,
    ...over,
  };
}

describe("RecentOutputsCard（実際の LLM 出力）", () => {
  it("言及の有無・モデル・経過時間・本文を出す", () => {
    const html = renderToStaticMarkup(createElement(RecentOutputsCard, { items: [output()], now: NOW }));
    expect(html).toContain("言及あり");
    expect(html).toContain("おすすめの SEO ツールは？");
    expect(html).toContain("ChatGPT");
    expect(html).toContain("4 時間");
    expect(html).toContain("A社やB社が有名です。");
  });

  it("長い本文は畳んで「全文を見る」を出す", () => {
    const html = renderToStaticMarkup(createElement(RecentOutputsCard, { items: [output()], now: NOW }));
    expect(html).toContain("全文を見る");
    expect(html).toContain("…");
  });

  it("短い本文は畳まない", () => {
    const html = renderToStaticMarkup(createElement(RecentOutputsCard, { items: [output({ responseText: "短い回答" })], now: NOW }));
    expect(html).not.toContain("全文を見る");
  });

  it("言及が無かった計測もそのまま出す（都合のよいものだけ見せない）", () => {
    const html = renderToStaticMarkup(createElement(RecentOutputsCard, { items: [output({ mentioned: false })], now: NOW }));
    expect(html).toContain("言及なし");
  });

  it("空なら案内だけ", () => {
    const html = renderToStaticMarkup(createElement(RecentOutputsCard, { items: [], now: NOW }));
    expect(html).toContain("まだ計測結果がありません");
  });
});

describe("DomainsCard（ドメイン別の引用）", () => {
  const domains = [
    { domain: "rival.co.jp", count: 12, share: 0.5, domainClass: "competitor" as const },
    { domain: "sample-kobo.jp", count: 6, share: 0.25, domainClass: "own" as const },
    { domain: "note.com", count: 6, share: 0.25, domainClass: "third_party" as const },
  ];

  it("ドメイン・区分・割合・回数を出す", () => {
    const html = renderToStaticMarkup(createElement(DomainsCard, { domains }));
    expect(html).toContain("rival.co.jp");
    expect(html).toContain("競合");
    expect(html).toContain("自社");
    expect(html).toContain("第三者");
    expect(html).toContain("12 回");
  });

  it("業界の地図と混ざらないよう、自分の計測が出どころだと書く", () => {
    const html = renderToStaticMarkup(createElement(DomainsCard, { domains }));
    expect(html).toContain("登録したプロンプト・キーワードの計測で");
  });

  it("空なら案内だけ", () => {
    expect(renderToStaticMarkup(createElement(DomainsCard, { domains: [] }))).toContain("まだ引用データがありません");
  });
});

/* ───────────── 名前つきの見出し / AIO 分析の表（2026-09-22） ───────────── */

describe("SectionHeading", () => {
  it("ラベル・見出し・一言の 3 点を出す", () => {
    const html = renderToStaticMarkup(
      createElement(SectionHeading, { label: "Visibility", title: "ビジビリティ分析", description: "どのくらい言及されているか" }),
    );
    expect(html).toContain("Visibility");
    expect(html).toContain("ビジビリティ分析");
    expect(html).toContain("どのくらい言及されているか");
  });
});

function summary(over: Partial<KeywordOutcomeSummary> = {}): KeywordOutcomeSummary {
  const rows = [
    { keywordId: "k1", keyword: "seo 対策", seoRank: 2, rankMeasured: true, appearance: "present" as const, outcome: "none" as const, lastCheckedAt: "2026-09-21T00:00:00Z" },
    { keywordId: "k2", keyword: "seo スコア", seoRank: 1, rankMeasured: true, appearance: "present" as const, outcome: "cited" as const, lastCheckedAt: "2026-09-21T00:00:00Z" },
    { keywordId: "k3", keyword: "seo ツール", seoRank: null, rankMeasured: true, appearance: "absent" as const, outcome: "unmeasured" as const, lastCheckedAt: "2026-09-21T00:00:00Z" },
    { keywordId: "k4", keyword: "未計測の語", seoRank: null, rankMeasured: false, appearance: "unmeasured" as const, outcome: "unmeasured" as const, lastCheckedAt: null },
  ];
  return { rows, appearedCount: 2, citedCount: 1, citedRate: 0.5, opportunities: [rows[0]], ...over };
}

describe("KeywordOutcomesCard（AI Overviews 分析）", () => {
  it("KPI 3 つと、キーワードごとの行を出す", () => {
    const html = renderToStaticMarkup(createElement(KeywordOutcomesCard, { summary: summary() }));
    expect(html).toContain("AI の回答が出た語");
    expect(html).toContain("自社が引用された語");
    expect(html).toContain("自社引用率");
    expect(html).toContain("seo 対策");
    expect(html).toContain("引用あり");
    expect(html).toContain("引用なし");
  });

  it("「圏外」と「未計測」を書き分ける", () => {
    const html = renderToStaticMarkup(createElement(KeywordOutcomesCard, { summary: summary() }));
    expect(html).toContain("圏外");
    expect(html).toContain("未計測");
    expect(html).toContain("非出現");
    expect(html).toContain("この 2 つを混ぜません");
  });

  it("引用を取りに行ける語があれば件数つきで知らせる", () => {
    const html = renderToStaticMarkup(createElement(KeywordOutcomesCard, { summary: summary() }));
    expect(html).toContain("引用を取りに行ける語が 1 件");
  });

  it("出現が 0 のときは引用率を 0% と書かない", () => {
    const html = renderToStaticMarkup(
      createElement(KeywordOutcomesCard, { summary: summary({ appearedCount: 0, citedCount: 0, citedRate: null, opportunities: [] }) }),
    );
    expect(html).toContain("AI の回答が出た語がまだありません");
    expect(html).not.toContain("引用を取りに行ける語が");
  });

  it("行が無ければ登録の案内だけ", () => {
    const html = renderToStaticMarkup(
      createElement(KeywordOutcomesCard, { summary: summary({ rows: [], appearedCount: 0, citedCount: 0, citedRate: null, opportunities: [] }) }),
    );
    expect(html).toContain("設定の「対策キーワード」を登録すると");
  });
});
