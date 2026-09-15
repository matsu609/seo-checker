/**
 * URL ルール U01〜U08 と検索での見え方 S01〜S04（docs/dev/diagnosis-rules-spec.md §9.6）。
 *
 * §6 の「自動統合しない項目」がそのままここのルールになる。似た URL を勝手に
 * 1 つにまとめず、「揺れている」という事実だけを出して人間に確認してもらう。
 * 重複コンテンツやカニバリゼーションとは断定しない（§18）。
 */
import { formatNumber, formatPercent, gsc, rule } from "./helpers";
import { isHomePath, normalizeUrl } from "../normalize";
import type { DiagnosisRule, KeyedMetrics } from "../types";

interface Variant {
  rows: KeyedMetrics[];
  a: number;
  b: number;
}

/** 条件を満たす URL と満たさない URL が両方あるか */
function split(rows: readonly KeyedMetrics[], test: (url: string) => boolean | null): Variant | null {
  const yes: KeyedMetrics[] = [];
  const no: KeyedMetrics[] = [];
  for (const r of rows) {
    const v = test(r.key);
    if (v === null) continue;
    (v ? yes : no).push(r);
  }
  if (yes.length === 0 || no.length === 0) return null;
  return { rows: [...yes.slice(0, 3), ...no.slice(0, 3)], a: yes.length, b: no.length };
}

function variantRule(args: {
  id: string;
  name: string;
  severity: DiagnosisRule["severity"];
  labelA: string;
  labelB: string;
  test: (url: string) => boolean | null;
  fact: string;
  possibleCauses: string[];
  requiredChecks: string[];
  recommendedActions: string[];
  prohibitedConclusions: string[];
}): DiagnosisRule {
  return rule({
    id: args.id,
    category: "url",
    name: args.name,
    severity: args.severity,
    defaultConfidence: "high",
    fact: args.fact,
    possibleCauses: args.possibleCauses,
    requiredChecks: args.requiredChecks,
    recommendedActions: args.recommendedActions,
    prohibitedConclusions: args.prohibitedConclusions,
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const found = split(g.pages.current, args.test);
      if (!found) return null;
      return {
        evidence: [
          `${args.labelA} が ${found.a} 件、${args.labelB} が ${found.b} 件、どちらも検索結果に出ています`,
          ...found.rows.map((r) => `${r.key}（表示 ${formatNumber(r.impressions)} / クリック ${formatNumber(r.clicks)}）`),
        ],
        subjects: found.rows.map((r) => r.key),
        impact: 0.3,
      };
    },
  });
}

export const URL_RULES: DiagnosisRule[] = [
  variantRule({
    id: "U01",
    name: "拡張子ありと拡張子なしの混在",
    severity: "low",
    labelA: "`.html` などの拡張子つき URL",
    labelB: "拡張子なしの URL",
    test: (url) => {
      const n = normalizeUrl(url);
      if (!n || isHomePath(n.path)) return null;
      return n.extension !== null && /^(html?|php)$/i.test(n.extension);
    },
    fact: "拡張子つきの URL と拡張子なしの URL が混ざっている",
    possibleCauses: ["リニューアル前後の URL が両方残っている", "CMS の設定が途中で変わった"],
    requiredChecks: ["両方の URL が同じ内容を返すか", "canonical の指定", "リダイレクトの有無"],
    recommendedActions: ["同じ内容なら、片方に 301 リダイレクトして URL を 1 つにする"],
    prohibitedConclusions: ["拡張子の有無だけで、同じページだと決めつけない（別ページのこともある）"],
  }),
  variantRule({
    id: "U02",
    name: "末尾スラッシュの混在",
    severity: "low",
    labelA: "末尾にスラッシュがある URL",
    labelB: "末尾にスラッシュが無い URL",
    test: (url) => {
      const n = normalizeUrl(url);
      if (!n || isHomePath(n.path) || n.extension !== null) return null;
      return n.trailingSlash;
    },
    fact: "同じ階層で、末尾スラッシュのある URL と無い URL が混ざっている",
    possibleCauses: ["サーバーの設定", "内部リンクの書き方が統一されていない"],
    requiredChecks: ["両方が同じ内容を返すか", "canonical の指定"],
    recommendedActions: ["どちらかに揃え、もう一方は 301 でリダイレクトする", "内部リンクも揃った形で書き直す"],
    prohibitedConclusions: ["表記の違いだけで重複コンテンツと断定しない"],
  }),
  variantRule({
    id: "U03",
    name: "www ありと www なしの混在",
    severity: "medium",
    labelA: "www つきの URL",
    labelB: "www 無しの URL",
    test: (url) => {
      const n = normalizeUrl(url);
      return n ? n.www : null;
    },
    fact: "www ありと www なしの両方が検索結果に出ている",
    possibleCauses: ["ドメインの統一（リダイレクト）ができていない"],
    requiredChecks: ["どちらが正なのか", "301 リダイレクトの設定"],
    recommendedActions: ["どちらか一方に 301 でまとめる（評価が分散するため）"],
    prohibitedConclusions: ["表記の違いだけで、評価が半分になっているとは断定しない"],
  }),
  variantRule({
    id: "U04",
    name: "言語パスの混在",
    severity: "low",
    labelA: "言語パス（/ja/ や /en/）つきの URL",
    labelB: "言語パスなしの URL",
    test: (url) => {
      const n = normalizeUrl(url);
      return n ? n.langPrefix !== null : null;
    },
    fact: "言語パスのある URL と無い URL が混ざっている",
    possibleCauses: ["多言語化の途中", "日本語版だけ言語パスが無い"],
    requiredChecks: ["hreflang の指定", "canonical の指定", "それぞれが別の言語のページか"],
    recommendedActions: ["hreflang で言語ごとの対応を明示する"],
    prohibitedConclusions: ["言語違いのページを重複コンテンツとして扱わない"],
  }),
  variantRule({
    id: "U06",
    name: "パラメータつき URL の表示",
    severity: "low",
    labelA: "クエリパラメータつきの URL",
    labelB: "パラメータ無しの URL",
    test: (url) => {
      const n = normalizeUrl(url);
      return n ? n.key.includes("?") : null;
    },
    fact: "クエリパラメータのついた URL が検索結果に出ている",
    possibleCauses: ["絞り込みや並べ替えの URL がインデックスされている", "セッション ID や計測用の値が残っている"],
    requiredChecks: ["パラメータで内容が変わるか", "canonical の指定"],
    recommendedActions: ["内容が変わらないパラメータは canonical でまとめる"],
    prohibitedConclusions: ["パラメータがあるだけで不要な URL と決めない（内容が変わることもある）"],
  }),
  variantRule({
    id: "U08",
    name: "HTTP の URL が残っている",
    severity: "high",
    labelA: "http:// の URL",
    labelB: "https:// の URL",
    test: (url) => {
      const n = normalizeUrl(url);
      return n ? !n.https : null;
    },
    fact: "暗号化されていない http の URL が検索結果に出ている",
    possibleCauses: ["HTTPS へのリダイレクトが一部で効いていない"],
    requiredChecks: ["http でアクセスしたときに https へ転送されるか"],
    recommendedActions: ["サイト全体で http → https の 301 リダイレクトをかける"],
    prohibitedConclusions: [],
  }),

  rule({
    id: "U05",
    category: "url",
    name: "旧 CMS らしき URL の残存",
    severity: "low",
    defaultConfidence: "low",
    fact: "古い CMS でよく使われる形の URL が検索結果に残っている",
    possibleCauses: ["リニューアル前の URL がインデックスに残っている"],
    requiredChecks: ["その URL が今も開けるか", "リダイレクトの設定"],
    recommendedActions: ["現在のページへ 301 でリダイレクトする"],
    prohibitedConclusions: ["URL の形だけで旧ページと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const legacy = /\/(cgi-bin|index\.cgi|\?p=\d+|\?page_id=\d+|\?cat=\d+|\.cfm|\.asp|\.jsp)/i;
      const rows = g.pages.current.filter((p) => legacy.test(p.key));
      if (rows.length === 0) return null;
      return {
        evidence: rows.slice(0, 3).map((p) => `${p.key}（表示 ${formatNumber(p.impressions)}）`),
        subjects: rows.slice(0, 5).map((p) => p.key),
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "U07",
    category: "url",
    name: "カテゴリーと個別ページが同じ階層で競合している可能性",
    severity: "low",
    defaultConfidence: "low",
    fact: "同じ親階層のカテゴリーページと個別ページが、どちらも同じくらい表示されている",
    possibleCauses: ["内容が似ている", "個別ページの情報が薄い"],
    requiredChecks: ["両方に紐づくクエリが同じか", "内容の違い"],
    recommendedActions: ["同じクエリで競合しているなら役割を分ける（一覧は比較、個別は詳細）"],
    prohibitedConclusions: ["URL の階層だけでカニバリゼーションと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g) return null;
      const byParent = new Map<string, KeyedMetrics[]>();
      for (const p of g.pages.current) {
        if (p.impressions < ctx.thresholds.minimumRuleImpressions) continue;
        const n = normalizeUrl(p.key);
        if (!n) continue;
        const parts = n.path.split("/").filter(Boolean);
        if (parts.length < 2) continue;
        const parent = `/${parts[0]}`;
        const list = byParent.get(parent) ?? [];
        list.push(p);
        byParent.set(parent, list);
      }
      const hits: string[] = [];
      const subjects: string[] = [];
      for (const [parent, children] of byParent) {
        const category = g.pages.current.find((p) => normalizeUrl(p.key)?.path === parent);
        if (!category || category.impressions < ctx.thresholds.minimumRuleImpressions) continue;
        const top = [...children].sort((a, b) => b.impressions - a.impressions)[0];
        if (!top) continue;
        const ratio = Math.min(category.impressions, top.impressions) / Math.max(category.impressions, top.impressions);
        if (ratio < 0.5) continue;
        hits.push(`${parent}（表示 ${formatNumber(category.impressions)}）と ${normalizeUrl(top.key)?.path ?? top.key}（表示 ${formatNumber(top.impressions)}）`);
        subjects.push(category.key, top.key);
      }
      if (hits.length === 0) return null;
      return { evidence: hits.slice(0, 3), subjects: subjects.slice(0, 6), impact: 0.2 };
    },
  }),
];

export const APPEARANCE_RULES: DiagnosisRule[] = [
  rule({
    id: "S01",
    category: "appearance",
    name: "検索での見え方のデータが無い",
    severity: "low",
    defaultConfidence: "high",
    fact: "リッチリザルト（検索での見え方）の行が取得できていない",
    possibleCauses: ["対象となる構造化データが無い", "この期間に該当する表示が無かった", "プロパティがこの項目に対応していない"],
    requiredChecks: ["構造化データの実装状況（リッチリザルトテスト）"],
    recommendedActions: ["FAQ・パンくず・記事など、該当する構造化データを実装する余地があるか見る"],
    prohibitedConclusions: ["データが空欄であることを、構造化データのエラーと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || g.appearances !== null) return null;
      return { evidence: ["「検索での見え方」の行が 1 件も返りませんでした"], impact: 0.2 };
    },
  }),

  rule({
    id: "S02",
    category: "appearance",
    name: "リッチ表示なのに CTR が低い",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "リッチリザルトで表示されているのに、クリック率が低い種類がある",
    possibleCauses: ["検索結果上で答えが完結している", "表示されている内容が検索意図とずれている"],
    requiredChecks: ["実際の検索結果での見え方", "その種類に紐づくページ"],
    recommendedActions: ["検索結果で完結してしまう内容なら、続きを見たくなる情報（事例・価格・比較）を本文に足す"],
    prohibitedConclusions: ["リッチ表示が原因でクリックが減ったと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !g.appearances) return null;
      const rows = g.appearances.filter((a) => a.impressions >= ctx.thresholds.minimumRuleImpressions && a.ctr < ctx.thresholds.lowCtrTop10);
      if (rows.length === 0) return null;
      return {
        evidence: rows.slice(0, 5).map((a) => `${a.key}: 表示 ${formatNumber(a.impressions)} / クリック ${formatNumber(a.clicks)} / CTR ${formatPercent(a.ctr)}`),
        subjects: rows.slice(0, 5).map((a) => a.key),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "S04",
    category: "appearance",
    name: "見え方の種類ごとに成績が違う",
    severity: "low",
    defaultConfidence: "medium",
    fact: "リッチリザルトの種類によって、クリック率に差がある",
    possibleCauses: ["種類ごとに検索意図が違う"],
    requiredChecks: ["成績の良い種類に紐づくページ"],
    recommendedActions: ["成績の良い種類の構造化データを、対象ページに横展開する"],
    prohibitedConclusions: ["種類ごとの CTR を、通常の検索結果と同じ土俵で比べない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !g.appearances || g.appearances.length < 2) return null;
      const rows = g.appearances.filter((a) => a.impressions >= ctx.thresholds.minimumRuleImpressions);
      if (rows.length < 2) return null;
      const sorted = [...rows].sort((a, b) => b.ctr - a.ctr);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (worst.ctr <= 0 || best.ctr / worst.ctr < 2) return null;
      return {
        evidence: sorted.map((a) => `${a.key}: 表示 ${formatNumber(a.impressions)} / CTR ${formatPercent(a.ctr)} / 平均順位 ${a.position.toFixed(1)}`),
        subjects: sorted.map((a) => a.key),
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "S03",
    category: "appearance",
    name: "リッチ表示の増加",
    severity: "low",
    defaultConfidence: "low",
    fact: "リッチリザルトでの表示回数が、全体の表示回数のうち目立つ割合になっている",
    possibleCauses: ["構造化データが認識されている"],
    requiredChecks: ["どのページが対象になっているか"],
    recommendedActions: ["同じ構造化データを、まだ入っていない同種のページにも入れる"],
    prohibitedConclusions: ["リッチ表示の増加を、そのまま順位改善と読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = gsc(ctx);
      if (!g || !g.appearances || g.appearances.length === 0) return null;
      const impressions = g.appearances.reduce((acc, a) => acc + a.impressions, 0);
      if (g.totals.current.impressions === 0) return null;
      const share = impressions / g.totals.current.impressions;
      if (share < 0.1) return null;
      return {
        evidence: [
          `リッチリザルトでの表示が ${formatNumber(impressions)} 回（全体の ${formatPercent(share, 0)}）`,
          ...g.appearances.slice(0, 5).map((a) => `${a.key}: 表示 ${formatNumber(a.impressions)} / クリック ${formatNumber(a.clicks)}`),
        ],
        subjects: g.appearances.slice(0, 5).map((a) => a.key),
        impact: 0.2,
      };
    },
  }),
];
