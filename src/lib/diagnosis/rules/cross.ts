/**
 * Search Console × GA4 の突き合わせルール（docs/dev/diagnosis-rules-spec.md §11）。
 *
 * **仕様書の 20 件のうち、ここで実装するのは 8 件だけ**（利用者と相談のうえ 2026-09-16 に決定）。
 * 残りは次のどれかに当たるため、ルールにしない。
 *
 * - 既存のルールと重複（X08 = K02、X09 = K04、X10 = K05、X04 = T02）
 *   → 同じ話が報告書に 2 回出るだけになる
 * - ただ同時に起きているだけ（X01・X05・X06・X07・X12・X13）
 *   → 独立したルールが両方発火するので、1 つの話にまとめるのは LLM の仕事（§25）
 * - データが足りない（X11 = CRM、X19 = ページ遷移）
 *
 * 残した 8 件に共通するのは「**片方のデータだけでは計算できない数値**」を出すこと。
 * たとえば「検索のクリック 1,000 に対して GA4 の自然検索セッションが 400」という
 * 差は、GSC にも GA4 にも存在しない。両方を割って初めて出る。
 */
import { changeOf, comparable, formatNumber, formatPercent, indexOf, rule } from "./helpers";
import { normalizeUrl } from "../normalize";
import { purposeOf } from "./page";
import type { DiagnosisContext, DiagnosisRule, KeyedSessions } from "../types";

/** 両方のデータが揃っていて、母数も足りているか */
function both(ctx: DiagnosisContext): { gscClicks: number; organicSessions: number } | null {
  const g = ctx.gsc;
  const a = ctx.ga4;
  const d = ctx.derived.ga4;
  if (!g || !a || !d) return null;
  if (g.totals.current.clicks < 50 || a.totals.current.sessions < ctx.thresholds.minimumSessions) return null;
  return { gscClicks: g.totals.current.clicks, organicSessions: d.organicSessions.current };
}

/** GA4 のランディングページをパスで引けるようにする */
function landingByPath(ctx: DiagnosisContext): Map<string, KeyedSessions> {
  const map = new Map<string, KeyedSessions>();
  for (const row of ctx.ga4?.landing.current ?? []) {
    const path = normalizeUrl(row.key, ctx.origin)?.path;
    if (path) map.set(path, row);
  }
  return map;
}

/** 期間のずれを必ず添える（GSC は 3 日遅れで集計している） */
const PERIOD_NOTE = "Search Console と GA4 は集計の締めが違うため、数が完全に一致することはありません";

export const CROSS_RULES: DiagnosisRule[] = [
  rule({
    id: "X02",
    category: "cross",
    name: "検索のクリックに対して、サイト側の訪問が少なすぎる",
    severity: "critical",
    defaultConfidence: "medium",
    fact: "Search Console のクリック数に対して、GA4 の自然検索セッションが大幅に少ない",
    possibleCauses: [
      "**一部のページに計測タグが入っていない**",
      "同意バナーで計測が止まっている（同意するまで数えない設定）",
      "クリック先が別ドメインや外部サービスに飛んでいる",
      "GA4 のチャネル分類がずれていて、自然検索が Direct などに入っている",
      "ページの表示が遅く、計測が走る前に離脱している",
    ],
    requiredChecks: ["検索から着地するページに計測タグが入っているか", "同意バナーの設定", "GA4 のチャネル分類（Direct が不自然に多くないか）", "リダイレクトの有無"],
    recommendedActions: [
      "検索流入の多いページを 3 つ選び、実際に検索から開いて GA4 のリアルタイムに出るか確かめる",
      "Direct の比率が高ければ、参照元が引き継がれていない導線を探す",
    ],
    prohibitedConclusions: [
      "Search Console のクリック数と GA4 のセッション数の完全一致を求めない（20〜30% の差は正常）",
      "差があることだけで、すべての数字が信用できないとは書かない",
    ],
    effort: "medium",
    evaluate: (ctx) => {
      const v = both(ctx);
      if (!v) return null;
      const ratio = v.organicSessions / v.gscClicks;
      if (ratio >= 0.6) return null;
      const evidence = [
        `Search Console のクリック ${formatNumber(v.gscClicks)} に対し、GA4 の自然検索セッションは ${formatNumber(v.organicSessions)}（${formatPercent(ratio, 0)}）`,
        `${formatNumber(v.gscClicks - v.organicSessions)} 回分の訪問が GA4 に記録されていません`,
        PERIOD_NOTE,
      ];
      const direct = ctx.derived.ga4?.directShare;
      if (direct !== null && direct !== undefined && direct >= 0.3) {
        evidence.push(`参考: Direct（直接）の比率が ${formatPercent(direct, 0)} と高く、参照元が引き継がれていない可能性があります`);
      }
      return { evidence, confidence: ratio < 0.4 ? "high" : "medium", impact: 1 };
    },
  }),

  rule({
    id: "X03",
    category: "cross",
    name: "検索のクリックより、サイト側の訪問のほうが多い",
    severity: "low",
    defaultConfidence: "medium",
    fact: "GA4 の自然検索セッションが、Search Console のクリック数を大きく上回っている",
    possibleCauses: [
      "Google 以外の検索エンジン（Yahoo!・Bing）からの流入が含まれている",
      "Search Console のプロパティが一部のサブドメインしか見ていない",
      "1 回のクリックが複数のセッションに分かれている（30 分以上の中断）",
    ],
    requiredChecks: ["GA4 の参照元で Google 以外の検索エンジンがどれくらいあるか", "Search Console のプロパティの範囲（ドメインプロパティか URL プレフィックスか）"],
    recommendedActions: ["Search Console をドメインプロパティで登録し直すと範囲が揃う"],
    prohibitedConclusions: ["数が合わないことを、そのまま計測の不具合と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const v = both(ctx);
      if (!v) return null;
      const ratio = v.organicSessions / v.gscClicks;
      if (ratio <= 1.5) return null;
      return {
        evidence: [
          `GA4 の自然検索セッション ${formatNumber(v.organicSessions)} に対し、Search Console のクリックは ${formatNumber(v.gscClicks)}（${formatPercent(ratio, 0)}）`,
          PERIOD_NOTE,
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "X14",
    category: "cross",
    name: "海外での表示は多いが、訪問後の行動が伴っていない",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "検索結果では海外での表示が多いのに、海外からの訪問はほとんど読まれずに終わっている",
    possibleCauses: ["言語が合っていない", "対象としていない市場", "順位計測ツールなどのノイズ"],
    requiredChecks: ["その国が事業の対象か", "海外からの問い合わせが実際にあるか", "英語ページの有無"],
    recommendedActions: ["対象外なら、日本に絞った数値で改めて評価する（全体の CTR とエンゲージメント率が実態より低く見えるため）"],
    prohibitedConclusions: ["海外での表示が多いだけで、海外に需要があると断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      const a = ctx.ga4;
      const share = ctx.derived.foreignImpressionShare;
      if (!g || !a || share === null || share < ctx.thresholds.highForeignImpressionShare) return null;
      const foreign = a.countries.filter((c) => c.key !== "Japan");
      const sessions = foreign.reduce((acc, c) => acc + c.sessions, 0);
      if (sessions < 20) return null;
      const engaged = foreign.reduce((acc, c) => acc + c.engagedSessions, 0);
      const rate = engaged / sessions;
      if (rate >= ctx.thresholds.lowEngagementRate) return null;
      return {
        evidence: [
          `検索結果での海外の表示が全体の ${formatPercent(share, 0)}`,
          `GA4 の海外からのセッション ${formatNumber(sessions)}、エンゲージメント率 ${formatPercent(rate, 0)}（判定の目安 ${formatPercent(ctx.thresholds.lowEngagementRate, 0)} 未満）`,
          `上位: ${foreign.slice(0, 3).map((c) => `${c.key} ${formatNumber(c.sessions)}`).join(" / ")}`,
        ],
        subjects: foreign.slice(0, 5).map((c) => c.key),
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "X15",
    category: "cross",
    name: "モバイルは検索結果側に問題がある（ページ側ではない）",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "モバイルの検索結果ではクリックされにくいが、訪問したあとはよく読まれている",
    possibleCauses: ["モバイルの検索結果で順位が低い", "タイトルが長くて切れている", "地図・広告・AI 概要に押し下げられている"],
    requiredChecks: ["モバイルでの実際の検索結果の見え方", "モバイルの平均掲載順位"],
    recommendedActions: ["**ページの作り直しではなく、検索結果での見え方（title・説明文・順位）を先に直す**", "title を短くして要点を前に置く"],
    prohibitedConclusions: ["モバイルの CTR が低いことを、ページの表示崩れの問題と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      const a = ctx.ga4;
      if (!g || !a) return null;
      const scMobile = g.devices.current.find((d) => d.key.toUpperCase() === "MOBILE");
      const scDesktop = g.devices.current.find((d) => d.key.toUpperCase() === "DESKTOP");
      const gaMobile = a.devices.current.find((d) => d.key === "mobile");
      if (!scMobile || !scDesktop || !gaMobile) return null;
      if (scMobile.impressions < ctx.thresholds.minimumRuleImpressions || gaMobile.sessions < 50) return null;
      if (scDesktop.ctr <= 0) return null;
      const ctrGap = (scDesktop.ctr - scMobile.ctr) / scDesktop.ctr;
      const engagement = gaMobile.engagedSessions / gaMobile.sessions;
      if (ctrGap < ctx.thresholds.deviceCtrGapRate || engagement < 0.6) return null;
      return {
        evidence: [
          `検索結果: モバイルの CTR ${formatPercent(scMobile.ctr)} はパソコン ${formatPercent(scDesktop.ctr)} より ${formatPercent(ctrGap, 0)} 低い`,
          `訪問後: モバイルのエンゲージメント率は ${formatPercent(engagement, 0)}（${formatNumber(gaMobile.sessions)} セッション）で、ページ側の問題は見当たらない`,
        ],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "X16",
    category: "cross",
    name: "モバイルはページ側に問題がある（検索結果側ではない）",
    severity: "high",
    defaultConfidence: "medium",
    fact: "モバイルの検索結果では普通にクリックされているのに、訪問後の行動が悪い",
    possibleCauses: ["モバイルでの表示速度", "画面に収まらない要素", "問い合わせボタンが押しにくい", "文字が小さい・行間が詰まっている"],
    requiredChecks: ["実機での表示", "モバイルの実ユーザー速度（LCP / INP）", "最初の画面に何が見えているか"],
    recommendedActions: ["**検索結果ではなく、ページ側を先に直す**", "実機で主要ページを開き、最初の画面と問い合わせボタンを確かめる"],
    prohibitedConclusions: ["数字だけでデザインの問題と断定しない（速度の可能性を残す）"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      const a = ctx.ga4;
      if (!g || !a) return null;
      const scMobile = g.devices.current.find((d) => d.key.toUpperCase() === "MOBILE");
      const scDesktop = g.devices.current.find((d) => d.key.toUpperCase() === "DESKTOP");
      const gaMobile = a.devices.current.find((d) => d.key === "mobile");
      const gaDesktop = a.devices.current.find((d) => d.key === "desktop");
      if (!scMobile || !scDesktop || !gaMobile || !gaDesktop) return null;
      if (scMobile.impressions < ctx.thresholds.minimumRuleImpressions || gaMobile.sessions < 50 || gaDesktop.sessions < 50) return null;
      if (scDesktop.ctr <= 0) return null;
      const ctrGap = (scDesktop.ctr - scMobile.ctr) / scDesktop.ctr;
      const mobileEngagement = gaMobile.engagedSessions / gaMobile.sessions;
      const desktopEngagement = gaDesktop.engagedSessions / gaDesktop.sessions;
      if (ctrGap > 0.15 || desktopEngagement <= 0) return null;
      if ((desktopEngagement - mobileEngagement) / desktopEngagement < 0.25) return null;
      return {
        evidence: [
          `検索結果: モバイルの CTR ${formatPercent(scMobile.ctr)} はパソコン ${formatPercent(scDesktop.ctr)} と大きく変わらない`,
          `訪問後: モバイルのエンゲージメント率 ${formatPercent(mobileEngagement, 0)} に対し、パソコンは ${formatPercent(desktopEngagement, 0)}`,
          `モバイルの平均エンゲージメント時間 ${gaMobile.engagementSeconds.toFixed(0)} 秒 / パソコン ${gaDesktop.engagementSeconds.toFixed(0)} 秒`,
        ],
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "X17",
    category: "cross",
    name: "順位は上がったのに、訪問が増えていないページがある",
    severity: "high",
    defaultConfidence: "medium",
    fact: "Search Console で平均掲載順位が上がったページなのに、GA4 の着地セッションが増えていない",
    possibleCauses: ["上がったのが検索数の少ない語だった", "title・説明文が弱くクリックされていない", "そのページの計測が漏れている", "着地する URL が別（リダイレクト先）になっている"],
    requiredChecks: ["そのページに紐づく検索語の表示回数", "そのページの CTR", "そのページの計測タグ"],
    recommendedActions: ["表示回数が伴っているかを先に確かめ、伴っていれば title と説明文を書き直す"],
    prohibitedConclusions: ["順位の改善を成果として単独で報告しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      if (!g || !ctx.ga4 || !comparable(ctx)) return null;
      const before = indexOf(g.pages.previous);
      const landingNow = landingByPath(ctx);
      const landingBefore = new Map<string, KeyedSessions>();
      for (const row of ctx.ga4.landing.previous) {
        const path = normalizeUrl(row.key, ctx.origin)?.path;
        if (path) landingBefore.set(path, row);
      }
      const hits: string[] = [];
      const subjects: string[] = [];
      for (const page of g.pages.current) {
        if (page.impressions < ctx.thresholds.minimumRuleImpressions) continue;
        const prev = before.get(page.key);
        if (!prev) continue;
        if (prev.position - page.position < ctx.thresholds.significantPositionChange) continue;
        const path = normalizeUrl(page.key)?.path;
        if (!path) continue;
        const now = landingNow.get(path)?.sessions ?? 0;
        const was = landingBefore.get(path)?.sessions ?? 0;
        if (was > 0 && (now - was) / was >= ctx.thresholds.flatChangeRange) continue;
        hits.push(`${path}: 平均順位 ${prev.position.toFixed(1)} → ${page.position.toFixed(1)}、着地セッション ${formatNumber(was)} → ${formatNumber(now)}`);
        subjects.push(page.key);
      }
      if (hits.length === 0) return null;
      return { evidence: hits.slice(0, 5), subjects: subjects.slice(0, 10), impact: 0.7 };
    },
  }),

  rule({
    id: "X18",
    category: "cross",
    name: "検索で出ているページと、実際に訪問されているページが違う",
    severity: "medium",
    defaultConfidence: "low",
    fact: "検索結果によく出るページの種類と、実際に最初に開かれるページの種類が食い違っている",
    possibleCauses: ["検索結果からのクリックが記事に集中している", "商品ページは表示されるがクリックされていない", "リダイレクトで着地先が変わっている"],
    requiredChecks: ["商品ページの CTR", "記事から商品ページへの移動", "リダイレクトの設定"],
    recommendedActions: ["表示は多いのにクリックされていないページの title と説明文を直す"],
    prohibitedConclusions: ["URL の形だけでページの役割を決めつけない（この判定は URL のパターンによる推定です）"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      const a = ctx.ga4;
      if (!g || !a || g.pages.current.length < 5 || a.landing.current.length < 3) return null;
      const impressionsOf = (purpose: string) =>
        g.pages.current.filter((p) => purposeOf(p.key) === purpose).reduce((acc, p) => acc + p.impressions, 0);
      const landingOf = (purpose: string) =>
        a.landing.current
          .filter((l) => purposeOf(`${ctx.origin}${normalizeUrl(l.key, ctx.origin)?.path ?? l.key}`) === purpose)
          .reduce((acc, l) => acc + l.sessions, 0);

      const totalImpressions = g.pages.current.reduce((acc, p) => acc + p.impressions, 0);
      const totalSessions = a.landing.current.reduce((acc, l) => acc + l.sessions, 0);
      if (totalImpressions === 0 || totalSessions === 0) return null;

      const productImpressionShare = impressionsOf("product") / totalImpressions;
      const productLandingShare = landingOf("product") / totalSessions;
      if (productImpressionShare < 0.3 || productLandingShare >= productImpressionShare / 2) return null;
      return {
        evidence: [
          `検索結果に出るページのうち商品・サービスページが ${formatPercent(productImpressionShare, 0)}（表示回数で）`,
          `実際に最初に開かれるページのうち商品・サービスページは ${formatPercent(productLandingShare, 0)}`,
        ],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "X20",
    category: "cross",
    name: "検索流入は減ったが、問い合わせ率は上がっている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "Search Console のクリックが減る一方で、自然検索からの問い合わせ率は上がっている",
    possibleCauses: ["関係の薄い検索語での流入が減った（質が上がった）", "対象外の露出が整理された"],
    requiredChecks: ["問い合わせの実数が減っていないか", "減った検索語が狙っていたものか"],
    recommendedActions: ["問い合わせの実数で見て、実害が無ければ量を戻すことを急がない"],
    prohibitedConclusions: ["流入の減少をそのまま悪化と読まない", "アクセス減少と売上減少を同一視しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ctx.gsc;
      const d = ctx.derived.ga4;
      if (!g || !d || !comparable(ctx) || d.organicConversionRate === null) return null;
      const clicks = changeOf(g.totals.current.clicks, g.totals.previous.clicks);
      if (clicks.rate === null || clicks.rate > ctx.thresholds.majorDecreaseRate) return null;
      const organic = changeOf(d.organicSessions.current, d.organicSessions.previous);
      if (organic.rate === null || organic.rate > 0) return null;
      if (d.organicConversionRate < 0.005) return null;
      return {
        evidence: [
          `検索のクリック ${formatNumber(clicks.previous)} → ${formatNumber(clicks.current)}（${formatPercent(clicks.rate)}）`,
          `自然検索からの問い合わせ率 ${formatPercent(d.organicConversionRate, 2)}（自然検索 ${formatNumber(d.organicSessions.current)} セッション）`,
        ],
        impact: 0.3,
      };
    },
  }),
];

/**
 * 仕様書 §11 の 20 件のうち、ここでルールにしなかったもの。
 * 画面の「データが揃えば判定できる項目」と、理由の説明に使う。
 */
export const CROSS_SKIPPED = [
  { ids: ["X01", "X05", "X06", "X07", "X12", "X13"], reason: "独立したルールが両方発火するので、1 つの話にまとめるのは AI の役目（同じ指摘を 2 回出さないため）" },
  { ids: ["X04", "X08", "X09", "X10"], reason: "すでにある診断（T02 / K02 / K04 / K05）と同じ内容" },
] as const;

export const CROSS_PENDING = [
  { id: "X11", name: "キーイベントは増えたが実際の問い合わせは増えていない", needs: "CRM の問い合わせ件数（段階 G8）" },
  { id: "X19", name: "記事からの流入が商品ページに回っていない", needs: "GA4 のページ遷移（経路データ）" },
] as const;
