/**
 * GA4 ランディングページルール L01〜L10（docs/dev/diagnosis-rules-spec.md §10.2）。
 *
 * GA4 のランディングページは「訪問者が最初に到着したページ」。パスだけで返るので、
 * GSC の絶対 URL と比べる前に normalize.ts で揃える（§6）。
 */
import { changeOf, formatNumber, formatPercent, indexOf, rule } from "./helpers";
import { normalizeUrl } from "../normalize";
import { purposeOf } from "./page";
import type { DiagnosisContext, DiagnosisRule, KeyedSessions } from "../types";

function landingRows(ctx: DiagnosisContext): KeyedSessions[] {
  return ctx.ga4?.landing.current ?? [];
}

/** ランディングページのパス（"/service?x=1" の形で返ることがある） */
function pathOf(ctx: DiagnosisContext, key: string): string {
  const n = normalizeUrl(key, ctx.origin);
  return n?.path ?? key;
}

function enough(ctx: DiagnosisContext): boolean {
  return (ctx.ga4?.totals.current.sessions ?? 0) >= ctx.thresholds.minimumSessions;
}

/** 用途ごとの着地集中ルール */
function landingShareRule(args: {
  id: string;
  purpose: ReturnType<typeof purposeOf>;
  name: string;
  severity: DiagnosisRule["severity"];
  share: number;
  fact: string;
  possibleCauses: string[];
  requiredChecks: string[];
  recommendedActions: string[];
  prohibitedConclusions: string[];
}): DiagnosisRule {
  return rule({
    id: args.id,
    category: "landing",
    name: args.name,
    severity: args.severity,
    defaultConfidence: "medium",
    fact: args.fact,
    possibleCauses: args.possibleCauses,
    requiredChecks: args.requiredChecks,
    recommendedActions: args.recommendedActions,
    prohibitedConclusions: args.prohibitedConclusions,
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const rows = landingRows(ctx).filter((r) => purposeOf(`${ctx.origin}${pathOf(ctx, r.key)}`) === args.purpose);
      if (rows.length === 0) return null;
      const sessions = rows.reduce((a, r) => a + r.sessions, 0);
      const share = sessions / ctx.ga4.totals.current.sessions;
      if (share < args.share) return null;
      const top = [...rows].sort((a, b) => b.sessions - a.sessions).slice(0, 5);
      return {
        evidence: [
          `該当する着地ページ ${rows.length} 件で ${formatNumber(sessions)} セッション（全体の ${formatPercent(share, 0)}）`,
          ...top.map((r) => `${pathOf(ctx, r.key)}: ${formatNumber(r.sessions)} セッション / エンゲージメント率 ${formatPercent(r.sessions > 0 ? r.engagedSessions / r.sessions : 0, 0)}`),
        ],
        subjects: top.map((r) => r.key),
        impact: Math.min(1, share),
      };
    },
  });
}

export const LANDING_RULES: DiagnosisRule[] = [
  landingShareRule({
    id: "L01",
    purpose: "home",
    name: "トップページへの着地に集中",
    severity: "medium",
    share: 0.6,
    fact: "訪問の多くがトップページから始まっている",
    possibleCauses: ["指名検索や直接流入が中心", "下層ページが検索の入口になれていない"],
    requiredChecks: ["Search Console のページ別クリック", "Direct の比率"],
    recommendedActions: ["サービスごとのページを検索の入口として育てる", "トップから各サービスページへの本文中リンクを置く"],
    prohibitedConclusions: ["トップ着地が多いこと自体を問題と書かない（指名中心なら自然）"],
  }),
  rule({
    id: "L02",
    category: "landing",
    name: "商品・サービスページへの着地が少ない",
    severity: "high",
    defaultConfidence: "medium",
    fact: "商品・サービスのページから始まる訪問がほとんど無い",
    possibleCauses: ["非指名検索での露出が足りない", "サービスページが検索で評価されていない", "サービスページが URL から見分けられない作りになっている"],
    requiredChecks: ["Search Console でのサービスページの表示回数", "サービスページへの内部リンク", "サービスページの URL の付け方"],
    recommendedActions: ["サービスページごとに狙う検索語を 1 つ決めて、title と見出しに入れる", "トップと関連記事から本文中リンクを引く"],
    prohibitedConclusions: ["着地が少ないことだけで、そのページの内容が悪いと断定しない"],
    effort: "large",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const rows = ctx.ga4.landing.current.filter((r) => purposeOf(`${ctx.origin}${pathOf(ctx, r.key)}`) === "product");
      const sessions = rows.reduce((a, r) => a + r.sessions, 0);
      const share = sessions / ctx.ga4.totals.current.sessions;
      if (share >= 0.15) return null;
      return {
        evidence: [
          rows.length === 0
            ? "商品・サービスらしき URL の着地ページが 1 件もありません"
            : `商品・サービスページへの着地は ${formatNumber(sessions)} セッションで、全体の ${formatPercent(share, 0)}`,
        ],
        confidence: rows.length === 0 ? "low" : "medium",
        impact: 0.8,
      };
    },
  }),
  landingShareRule({
    id: "L06",
    purpose: "recruit",
    name: "採用ページへの着地が多い",
    severity: "medium",
    share: 0.15,
    fact: "採用ページから始まる訪問が一定の割合を占めている",
    possibleCauses: ["採用ページが検索で強い", "求職者と見込み客の流入が混ざっている"],
    requiredChecks: ["採用ページの着地セッション数", "顧客向けページの着地セッション数"],
    recommendedActions: ["顧客獲得の数値を見るときは、採用ページの着地を除いて集計する"],
    prohibitedConclusions: ["採用の流入を顧客獲得の成果に数えない"],
  }),

  rule({
    id: "L03",
    category: "landing",
    name: "商品・サービスページへの着地が増えている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "商品・サービスのページから始まる訪問が前期より増えている",
    possibleCauses: ["サービスページの順位が上がった", "内容の追加が効いた"],
    requiredChecks: ["増えたページからの問い合わせ", "そのページに紐づく検索語"],
    recommendedActions: ["増えているページの問い合わせ導線を強める（事例・価格・相談のしやすさ）"],
    prohibitedConclusions: ["着地の増加を、そのまま商談の増加と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const isProduct = (r: KeyedSessions) => purposeOf(`${ctx.origin}${pathOf(ctx, r.key)}`) === "product";
      const now = ctx.ga4.landing.current.filter(isProduct).reduce((a, r) => a + r.sessions, 0);
      const before = ctx.ga4.landing.previous.filter(isProduct).reduce((a, r) => a + r.sessions, 0);
      if (now < 20) return null;
      const change = changeOf(now, before);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      return { evidence: [`商品・サービスページへの着地 ${formatNumber(before)} → ${formatNumber(now)} セッション（${formatPercent(change.rate)}）`], impact: 0.5 };
    },
  }),

  rule({
    id: "L04",
    category: "landing",
    name: "記事に着地して、読まれずに離れている",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "ブログ・記事に着地したセッションのエンゲージメント率が低い",
    possibleCauses: ["検索意図と記事の内容が合っていない", "読み込みが遅い", "冒頭で結論に触れていない", "スマートフォンで読みにくい"],
    requiredChecks: ["その記事に紐づく検索語", "モバイルでの表示", "実ユーザーの表示速度"],
    recommendedActions: ["冒頭 3 行で結論を書く", "検索語がそのまま見出しに入っているか確かめる"],
    prohibitedConclusions: ["エンゲージメント率が低いだけで、記事の内容が悪いと断定しない（検索意図のずれのことが多い）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const rows = ctx.ga4.landing.current.filter((r) => {
        const purpose = purposeOf(`${ctx.origin}${pathOf(ctx, r.key)}`);
        return (purpose === "blog" || purpose === "news") && r.sessions >= 30;
      });
      const low = rows.filter((r) => r.engagedSessions / r.sessions < ctx.thresholds.lowEngagementRate);
      if (low.length === 0) return null;
      const sorted = [...low].sort((a, b) => b.sessions - a.sessions);
      return {
        evidence: [
          `記事に着地したページのうち、エンゲージメント率が ${formatPercent(ctx.thresholds.lowEngagementRate, 0)} 未満のものが ${low.length} 件`,
          ...sorted.slice(0, 5).map((r) => `${pathOf(ctx, r.key)}: ${formatNumber(r.sessions)} セッション / エンゲージメント率 ${formatPercent(r.engagedSessions / r.sessions, 0)}`),
        ],
        subjects: sorted.slice(0, 10).map((r) => r.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "L05",
    category: "landing",
    name: "記事に着地して、しっかり読まれている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "ブログ・記事に着地したセッションのエンゲージメント率が高い",
    possibleCauses: ["検索意図と内容が合っている"],
    requiredChecks: ["その記事からサービスページへ移動しているか", "その記事からの問い合わせ"],
    recommendedActions: ["読まれている記事の末尾と本文中に、関連するサービスページへのリンクを置く"],
    prohibitedConclusions: ["読まれていることを、そのまま見込み客と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const rows = ctx.ga4.landing.current.filter((r) => {
        const purpose = purposeOf(`${ctx.origin}${pathOf(ctx, r.key)}`);
        return (purpose === "blog" || purpose === "news") && r.sessions >= 30 && r.engagedSessions / r.sessions >= 0.7;
      });
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.sessions - a.sessions);
      return {
        evidence: sorted.slice(0, 5).map((r) => `${pathOf(ctx, r.key)}: ${formatNumber(r.sessions)} セッション / エンゲージメント率 ${formatPercent(r.engagedSessions / r.sessions, 0)}`),
        subjects: sorted.slice(0, 10).map((r) => r.key),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "L07",
    category: "landing",
    name: "存在しないページ（404）に着地している",
    severity: "high",
    defaultConfidence: "medium",
    fact: "404 らしきページから始まる訪問がある",
    possibleCauses: ["外部サイトのリンク切れ", "削除したページが検索結果に残っている", "内部リンクの間違い"],
    requiredChecks: ["その URL に実際にアクセスして 404 かどうか", "リンク元"],
    recommendedActions: ["該当 URL から現在のページへ 301 リダイレクトをかける"],
    prohibitedConclusions: ["URL の文字列だけで 404 と断定しない（実際にアクセスして確かめる）"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const rows = ctx.ga4.landing.current.filter((r) => /404|not[-_]?found|error/i.test(r.key) && r.sessions >= 3);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.sessions - a.sessions);
      return {
        evidence: sorted.slice(0, 5).map((r) => `${pathOf(ctx, r.key)}: ${formatNumber(r.sessions)} セッション`),
        subjects: sorted.slice(0, 10).map((r) => r.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "L08",
    category: "landing",
    name: "前期にあった着地ページが消えている",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "前期に訪問のあった着地ページが、当期には出てこない",
    possibleCauses: ["ページの削除や URL 変更", "順位の下落", "リダイレクトの設定漏れ"],
    requiredChecks: ["その URL が今も開けるか", "301 リダイレクトの設定"],
    recommendedActions: ["消えたページのうちセッションが多かったものから、URL の生死を確認する"],
    prohibitedConclusions: ["一覧に出ないことだけで、削除されたと断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const current = indexOf(ctx.ga4.landing.current.map((r) => ({ key: r.key, clicks: r.sessions, impressions: 0, ctr: 0, position: 0 })));
      const gone = ctx.ga4.landing.previous.filter((r) => r.sessions >= 20 && !current.has(r.key)).sort((a, b) => b.sessions - a.sessions);
      if (gone.length === 0) return null;
      return {
        evidence: [
          `前期に 20 セッション以上あったのに当期に出てこない着地ページが ${gone.length} 件`,
          ...gone.slice(0, 5).map((r) => `${pathOf(ctx, r.key)}: 前期 ${formatNumber(r.sessions)} セッション`),
        ],
        subjects: gone.slice(0, 10).map((r) => r.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "L10",
    category: "landing",
    name: "モバイルでの行動が明らかに悪い",
    severity: "high",
    defaultConfidence: "medium",
    fact: "モバイルのエンゲージメント率がパソコンよりはっきり低い",
    possibleCauses: ["モバイルでの表示速度", "画面に収まらない要素", "問い合わせボタンが押しにくい", "モバイルで内容が省略されている"],
    requiredChecks: ["実機での表示", "モバイルの実ユーザー速度（LCP / INP）", "フォームの入力しやすさ"],
    recommendedActions: ["実機で主要ページを開き、最初の画面に何が見えているか確かめる"],
    prohibitedConclusions: ["数字だけでデザインの問題と断定しない（速度・検索意図の可能性を残す）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const mobile = ctx.ga4.devices.current.find((d) => d.key === "mobile");
      const desktop = ctx.ga4.devices.current.find((d) => d.key === "desktop");
      if (!mobile || !desktop || mobile.sessions < 50 || desktop.sessions < 50) return null;
      const m = mobile.engagedSessions / mobile.sessions;
      const p = desktop.engagedSessions / desktop.sessions;
      if (p <= 0 || (p - m) / p < 0.3) return null;
      return {
        evidence: [
          `モバイル: ${formatNumber(mobile.sessions)} セッション / エンゲージメント率 ${formatPercent(m, 0)} / 平均エンゲージメント時間 ${mobile.engagementSeconds.toFixed(0)} 秒`,
          `パソコン: ${formatNumber(desktop.sessions)} セッション / エンゲージメント率 ${formatPercent(p, 0)} / 平均エンゲージメント時間 ${desktop.engagementSeconds.toFixed(0)} 秒`,
        ],
        impact: 0.7,
      };
    },
  }),
];

/** 判定に別のデータが要るもの */
export const LANDING_PENDING = [{ id: "L09", name: "海外ユーザーが日本語ページに着地", needs: "GA4 の国別 × ランディングページ" }] as const;
