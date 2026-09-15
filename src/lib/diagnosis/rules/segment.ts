/**
 * デバイス・国・言語ルール V01〜V05 / G01〜G07（docs/dev/diagnosis-rules-spec.md §9.5）。
 *
 * ここでいちばん気をつけるのは断定の禁止（§18）。
 * - モバイル CTR が低い = レスポンシブ表示の問題、とは限らない（検索結果側の話）
 * - 海外表示が多い = 海外需要がある、とは限らない
 */
import { comparable, changeOf, formatNumber, formatPercent, gsc, indexOf, rule } from "./helpers";
import type { DiagnosisRule, KeyedMetrics } from "../types";

const DEVICE_LABELS: Record<string, string> = { MOBILE: "モバイル", DESKTOP: "パソコン", TABLET: "タブレット" };

function deviceLabel(key: string): string {
  return DEVICE_LABELS[key.toUpperCase()] ?? key;
}

function pick(rows: readonly KeyedMetrics[], key: string): KeyedMetrics | undefined {
  return rows.find((r) => r.key.toUpperCase() === key);
}

export const SEGMENT_RULES: DiagnosisRule[] = [
  rule({
    id: "V01",
    category: "segment",
    name: "モバイルの CTR が低い",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "モバイルのクリック率がパソコンよりはっきり低い",
    possibleCauses: ["モバイルでの平均掲載順位が低い", "モバイルの検索結果で地図・広告・AI 概要に押し下げられている", "モバイルで検索されるクエリの性質が違う", "タイトルが長くて切れている"],
    requiredChecks: ["デバイス別の平均掲載順位", "モバイルで実際に検索したときの見え方", "デバイス別のクエリの違い"],
    recommendedActions: ["モバイルの検索結果で自社がどう見えるか実機で確認する", "title を短くして要点を前に置く"],
    prohibitedConclusions: ["モバイル CTR が低いだけで、レスポンシブ表示（ページの見た目）の問題と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const mobile = pick(g.devices.current, "MOBILE");
      const desktop = pick(g.devices.current, "DESKTOP");
      if (!mobile || !desktop) return null;
      if (mobile.impressions < ctx.thresholds.minimumRuleImpressions || desktop.impressions < ctx.thresholds.minimumRuleImpressions) return null;
      if (desktop.ctr <= 0) return null;
      const gap = (desktop.ctr - mobile.ctr) / desktop.ctr;
      if (gap < ctx.thresholds.deviceCtrGapRate) return null;
      return {
        evidence: [
          `モバイル: 表示 ${formatNumber(mobile.impressions)} / CTR ${formatPercent(mobile.ctr)} / 平均順位 ${mobile.position.toFixed(1)}`,
          `パソコン: 表示 ${formatNumber(desktop.impressions)} / CTR ${formatPercent(desktop.ctr)} / 平均順位 ${desktop.position.toFixed(1)}`,
          `モバイルの CTR はパソコンより ${formatPercent(gap, 0)} 低い`,
        ],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "V02",
    category: "segment",
    name: "モバイルの平均掲載順位が低い",
    severity: "medium",
    defaultConfidence: "high",
    fact: "モバイルの平均掲載順位がパソコンよりはっきり下",
    possibleCauses: ["モバイルでの表示速度や使い勝手の評価", "モバイルで表示されるクエリの幅が広い", "モバイル向けの内容が省略されている"],
    requiredChecks: ["モバイルの表示速度（実ユーザー）", "モバイルで内容が省略されていないか"],
    recommendedActions: ["モバイルの実ユーザー速度（LCP / INP）を確認する", "モバイルで折りたたまれている本文が無いか確認する"],
    prohibitedConclusions: ["順位差の原因を 1 つに断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const mobile = pick(g.devices.current, "MOBILE");
      const desktop = pick(g.devices.current, "DESKTOP");
      if (!mobile || !desktop) return null;
      if (mobile.impressions < ctx.thresholds.minimumRuleImpressions || desktop.impressions < ctx.thresholds.minimumRuleImpressions) return null;
      const diff = mobile.position - desktop.position;
      if (diff < ctx.thresholds.significantPositionChange) return null;
      return {
        evidence: [
          `モバイルの平均掲載順位 ${mobile.position.toFixed(1)}、パソコン ${desktop.position.toFixed(1)}（差 ${diff.toFixed(1)}）`,
          "平均掲載順位は表示回数で重み付けした平均で、個々のキーワードの順位ではありません",
        ],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "V03",
    category: "segment",
    name: "パソコンからの流入に集中",
    severity: "low",
    defaultConfidence: "high",
    fact: "クリックの大半がパソコンからで、モバイルが少ない",
    possibleCauses: ["法人向けで、業務中に調べられている（正常）", "モバイルでの露出が取れていない"],
    requiredChecks: ["想定している顧客が法人か個人か", "モバイルの表示回数と順位"],
    recommendedActions: ["法人向けなら問題ない。個人向けならモバイルの順位を確認する"],
    prohibitedConclusions: ["パソコン偏重をそのまま問題として扱わない（BtoB では正常）"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const total = g.devices.current.reduce((acc, d) => acc + d.clicks, 0);
      const desktop = pick(g.devices.current, "DESKTOP");
      if (!desktop || total === 0) return null;
      const share = desktop.clicks / total;
      if (share < 0.7) return null;
      return {
        evidence: [
          `パソコンからのクリックが ${formatNumber(desktop.clicks)} 回で全体の ${formatPercent(share, 0)}`,
          ...g.devices.current.map((d) => `${deviceLabel(d.key)}: クリック ${formatNumber(d.clicks)} / 表示 ${formatNumber(d.impressions)}`),
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "V04",
    category: "segment",
    name: "モバイルからの流入に集中",
    severity: "medium",
    defaultConfidence: "high",
    fact: "クリックの大半がモバイルから",
    possibleCauses: ["個人向け・来店型で、外出先から探されている（正常）"],
    requiredChecks: ["モバイルでの問い合わせ導線の押しやすさ", "フォームの入力項目数", "電話番号が押せるか"],
    recommendedActions: ["モバイル画面で、問い合わせボタンが画面内に見えるか実機で確認する", "電話番号をタップで発信できるようにする"],
    prohibitedConclusions: ["モバイル中心であることを、そのまま問題とも成果とも書かない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const total = g.devices.current.reduce((acc, d) => acc + d.clicks, 0);
      const mobile = pick(g.devices.current, "MOBILE");
      if (!mobile || total === 0) return null;
      const share = mobile.clicks / total;
      if (share < 0.7) return null;
      return {
        evidence: [
          `モバイルからのクリックが ${formatNumber(mobile.clicks)} 回で全体の ${formatPercent(share, 0)}`,
          ...g.devices.current.map((d) => `${deviceLabel(d.key)}: クリック ${formatNumber(d.clicks)} / 表示 ${formatNumber(d.impressions)}`),
        ],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "G01",
    category: "segment",
    name: "国内からの流入に集中",
    severity: "low",
    defaultConfidence: "high",
    fact: "クリックのほとんどが日本国内から",
    possibleCauses: ["国内向けの事業（正常）"],
    requiredChecks: ["海外展開の予定があるか"],
    recommendedActions: ["国内向けなら、この内訳は想定どおり"],
    prohibitedConclusions: ["国内集中をそのまま機会損失と書かない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const total = g.countries.current.reduce((acc, c) => acc + c.clicks, 0);
      const jp = g.countries.current.find((c) => c.key.toLowerCase() === "jpn");
      if (!jp || total === 0) return null;
      const share = jp.clicks / total;
      if (share < 0.9) return null;
      return { evidence: [`日本からのクリックが ${formatNumber(jp.clicks)} 回で全体の ${formatPercent(share, 0)}`], impact: 0.1 };
    },
  }),

  rule({
    id: "G02",
    category: "segment",
    name: "海外での高表示・低 CTR",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "日本以外の国での表示回数が多いのに、クリックがほとんど無い",
    possibleCauses: ["言語が合っていない", "検索意図と合っていない", "そもそも対象外の地域", "順位計測ツールなどのノイズ"],
    requiredChecks: ["どの国か", "その国で表示されているクエリ", "その国のクリック数"],
    recommendedActions: ["対象外なら、国を絞った数値で改めて評価する（全体の CTR が実態より低く見えるため）"],
    prohibitedConclusions: ["海外表示が多いだけで、海外に需要があると断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      const share = ctx.derived.foreignImpressionShare;
      if (!g || share === null || share < ctx.thresholds.highForeignImpressionShare) return null;
      const foreign = g.countries.current.filter((c) => c.key.toLowerCase() !== "jpn").sort((a, b) => b.impressions - a.impressions);
      const impressions = foreign.reduce((acc, c) => acc + c.impressions, 0);
      const clicks = foreign.reduce((acc, c) => acc + c.clicks, 0);
      if (impressions === 0) return null;
      const ctr = clicks / impressions;
      if (ctr >= ctx.thresholds.lowCtrTop10) return null;
      return {
        evidence: [
          `日本以外からの表示が ${formatNumber(impressions)} 回（全体の ${formatPercent(share, 0)}）、クリックは ${formatNumber(clicks)} 回で CTR ${formatPercent(ctr)}`,
          `上位: ${foreign.slice(0, 3).map((c) => `${c.key} 表示 ${formatNumber(c.impressions)}`).join(" / ")}`,
        ],
        subjects: foreign.slice(0, 5).map((c) => c.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "G03",
    category: "segment",
    name: "対象外地域での表示",
    severity: "low",
    defaultConfidence: "medium",
    fact: "事業の対象としていない国での表示が、全体の CTR を押し下げている",
    possibleCauses: ["言語が同じ地域からの検索", "自動検索"],
    requiredChecks: ["その地域が本当に対象外か"],
    recommendedActions: ["見込み顧客数の計算からは、対象外地域の表示回数を除く"],
    prohibitedConclusions: ["対象外地域の表示を、そのまま無価値と決めない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      const share = ctx.derived.foreignImpressionShare;
      if (!g || share === null || share < ctx.thresholds.highForeignImpressionShare) return null;
      const jp = g.countries.current.find((c) => c.key.toLowerCase() === "jpn");
      if (!jp || jp.impressions === 0) return null;
      const all = g.countries.current.reduce((acc, c) => acc + c.impressions, 0);
      const allClicks = g.countries.current.reduce((acc, c) => acc + c.clicks, 0);
      const overall = all > 0 ? allClicks / all : 0;
      if (jp.ctr <= overall) return null;
      return {
        evidence: [
          `全体の CTR は ${formatPercent(overall)} ですが、日本に絞ると ${formatPercent(jp.ctr)} です`,
          `対象外の国の表示が ${formatPercent(share, 0)} 含まれているため、全体の CTR は実態より低く出ます`,
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "G05",
    category: "segment",
    name: "海外からのクリックの増加",
    severity: "low",
    defaultConfidence: "low",
    fact: "日本以外からのクリックが増えている",
    possibleCauses: ["海外での認知が広がった", "英語ページが評価され始めた", "一時的なノイズ"],
    requiredChecks: ["増えた国とクエリ", "その国からの問い合わせがあるか"],
    recommendedActions: ["問い合わせにつながっているか確認してから、対応を判断する"],
    prohibitedConclusions: ["海外クリックの増加を、そのまま海外需要の証拠としない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !comparable(ctx)) return null;
      const foreignNow = g.countries.current.filter((c) => c.key.toLowerCase() !== "jpn").reduce((acc, c) => acc + c.clicks, 0);
      const foreignBefore = g.countries.previous.filter((c) => c.key.toLowerCase() !== "jpn").reduce((acc, c) => acc + c.clicks, 0);
      if (foreignNow < 20) return null;
      const change = changeOf(foreignNow, foreignBefore);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      return {
        evidence: [`日本以外からのクリック ${formatNumber(foreignBefore)} → ${formatNumber(foreignNow)} 回（${formatPercent(change.rate)}）`],
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "G07",
    category: "segment",
    name: "特定の国での不自然な表示",
    severity: "low",
    defaultConfidence: "low",
    fact: "ある国だけ、前期には無かった表示が急に現れている",
    possibleCauses: ["順位計測ツールやクローラー", "スパム的な検索", "その国での話題化"],
    requiredChecks: ["その国のクリック数（0 なら人ではない可能性）", "その国で表示されているクエリ"],
    recommendedActions: ["その国を除いた数値でも傾向が同じか確かめる"],
    prohibitedConclusions: ["ボットと断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !comparable(ctx)) return null;
      const before = indexOf(g.countries.previous);
      const fresh = g.countries.current.filter((c) => {
        if (c.key.toLowerCase() === "jpn") return false;
        const prev = before.get(c.key);
        return c.impressions >= ctx.thresholds.minimumRuleImpressions && c.clicks === 0 && (!prev || prev.impressions < c.impressions / 5);
      });
      if (fresh.length === 0) return null;
      const sorted = [...fresh].sort((a, b) => b.impressions - a.impressions);
      return {
        evidence: sorted.slice(0, 3).map((c) => `${c.key}: 当期の表示 ${formatNumber(c.impressions)} 回・クリック 0（前期 ${formatNumber(before.get(c.key)?.impressions ?? 0)} 回）`),
        subjects: sorted.slice(0, 5).map((c) => c.key),
        impact: 0.2,
      };
    },
  }),
];

/**
 * デバイス × クエリ、言語ページの有無など、いまの取得では判定できないもの。
 * GSC は device と query を同時に取れるので、必要になれば V05 は実装できる。
 */
export const SEGMENT_PENDING = [
  { id: "V05", name: "デバイス別のクエリ差", needs: "device × query の同時取得" },
  { id: "G04", name: "翻訳ページの低迷", needs: "言語別ページの一覧（クロール側と突き合わせ）" },
  { id: "G06", name: "言語ページなし", needs: "hreflang の実装状況（クロール側）" },
] as const;
