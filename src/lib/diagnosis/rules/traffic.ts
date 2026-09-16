/**
 * GA4 集客ルール A01〜A10（docs/dev/diagnosis-rules-spec.md §10.1）。
 *
 * すべてセッション単位で見る。ユーザー獲得（新規ユーザー単位）とは混ぜない（M09）。
 * チャネル名は GA4 の既定チャネルグループ（英語）で返る。
 */
import { changeOf, formatNumber, formatPercent, rule } from "./helpers";
import type { DiagnosisContext, DiagnosisRule, Ga4Dataset, KeyedSessions } from "../types";

const CHANNEL_LABELS: Record<string, string> = {
  "Organic Search": "自然検索",
  Direct: "直接",
  Referral: "参照（他サイトからのリンク）",
  "Paid Search": "検索広告",
  "Organic Social": "SNS",
  "Paid Social": "SNS 広告",
  Email: "メール",
  Display: "ディスプレイ広告",
  "Organic Video": "動画",
  Unassigned: "分類できず",
};

export function channelLabel(key: string): string {
  return CHANNEL_LABELS[key] ?? key;
}

function ga4(ctx: DiagnosisContext): Ga4Dataset | null {
  return ctx.ga4;
}

function channel(rows: readonly KeyedSessions[], key: string): KeyedSessions | undefined {
  return rows.find((r) => r.key === key);
}

/** GA4 の期間も揃っているか */
function ga4Comparable(ctx: DiagnosisContext): boolean {
  const g = ctx.ga4;
  if (!g) return false;
  return g.totals.current.sessions >= ctx.thresholds.minimumSessions || g.totals.previous.sessions >= ctx.thresholds.minimumSessions;
}

export const TRAFFIC_RULES: DiagnosisRule[] = [
  rule({
    id: "A01",
    category: "traffic",
    name: "自然検索からの訪問が増えている",
    severity: "low",
    defaultConfidence: "high",
    fact: "自然検索（Organic Search）のセッションが前期より増えている",
    possibleCauses: ["検索順位の改善", "ページの追加", "検索需要の増加"],
    requiredChecks: ["Search Console のクリック数も同じように増えているか", "増えた訪問が問い合わせにつながっているか"],
    recommendedActions: ["増えた流入の着地ページを確認し、そこから問い合わせへの導線を強める"],
    prohibitedConclusions: ["自然検索セッションの増加を、そのまま SEO 施策の成果と即断しない", "アクセス増加を売上増加と同一視しない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || !ga4Comparable(ctx)) return null;
      const d = ctx.derived.ga4;
      if (!d) return null;
      const change = changeOf(d.organicSessions.current, d.organicSessions.previous);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      return {
        evidence: [`自然検索のセッション ${formatNumber(change.previous)} → ${formatNumber(change.current)}（${formatPercent(change.rate)}）`],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "A02",
    category: "traffic",
    name: "自然検索からの訪問が減っている",
    severity: "high",
    defaultConfidence: "high",
    fact: "自然検索のセッションが前期より減っている",
    possibleCauses: ["順位の下落", "インデックスからの脱落", "検索需要の季節変動", "計測の不具合"],
    requiredChecks: ["Search Console のクリック数も減っているか（減っていなければ計測を疑う）", "どの着地ページが減ったか", "前年同期のデータ"],
    recommendedActions: ["Search Console のページ別クリックと突き合わせ、減ったページを特定する"],
    prohibitedConclusions: ["前年同期がない状態で季節性を断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || !ga4Comparable(ctx)) return null;
      const d = ctx.derived.ga4;
      if (!d) return null;
      const change = changeOf(d.organicSessions.current, d.organicSessions.previous);
      if (change.rate === null || change.rate > ctx.thresholds.majorDecreaseRate) return null;
      return {
        evidence: [`自然検索のセッション ${formatNumber(change.previous)} → ${formatNumber(change.current)}（${formatPercent(change.rate)}）`],
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "A03",
    category: "traffic",
    name: "直接流入（Direct）の比率が高い",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "チャネルが Direct（直接）になっているセッションが多い",
    possibleCauses: ["指名検索やブックマークからの既存顧客", "**計測の欠落**（参照元が引き継がれていない）", "メールや PDF、QR コードからの流入で UTM が付いていない", "外部の決済・予約サービスを経由してセッションが分断されている"],
    requiredChecks: ["外部ドメインをまたぐ導線があるか（クロスドメイン設定）", "メール・チラシ・QR の URL に UTM が付いているか", "自己参照トラフィックの除外設定"],
    recommendedActions: ["外部サービスを挟む導線があれば、クロスドメイン測定を設定する", "社外に配る URL には UTM を付ける"],
    prohibitedConclusions: ["Direct が多いことを、そのままブランド力の証拠と読まない（計測漏れの可能性が高い）"],
    effort: "medium",
    evaluate: (ctx) => {
      const d = ctx.derived.ga4;
      const g = ga4(ctx);
      if (!g || !d || d.directShare === null || d.directShare < 0.4) return null;
      if (g.totals.current.sessions < ctx.thresholds.minimumSessions) return null;
      return {
        evidence: [
          `Direct が ${formatPercent(d.directShare, 0)}（${formatNumber(channel(g.channels.current, "Direct")?.sessions ?? 0)} セッション / 全 ${formatNumber(g.totals.current.sessions)}）`,
          ...d.channelShare.slice(0, 5).map((c) => `${channelLabel(c.channel)}: ${formatNumber(c.sessions)}（${formatPercent(c.share, 0)}）`),
        ],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "A04",
    category: "traffic",
    name: "参照（他サイトからのリンク）が増えている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "Referral（他サイトからのリンク）のセッションが増えている",
    possibleCauses: ["メディア掲載", "取引先や業界サイトからの紹介", "スパム的な参照元"],
    requiredChecks: ["増えた参照元がどこか", "その流入のエンゲージメント率"],
    recommendedActions: ["有効な紹介元が分かれば、同種のサイトへの掲載を増やす"],
    prohibitedConclusions: ["参照の増加を、そのまま評価の高まりと読まない（スパムの可能性がある）"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || !ga4Comparable(ctx)) return null;
      const now = channel(g.channels.current, "Referral")?.sessions ?? 0;
      const before = channel(g.channels.previous, "Referral")?.sessions ?? 0;
      if (now < 20) return null;
      const change = changeOf(now, before);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      const sources = g.sources.filter((s) => !s.key.includes("google / organic") && !s.key.includes("(direct)")).slice(0, 3);
      return {
        evidence: [
          `参照のセッション ${formatNumber(before)} → ${formatNumber(now)}（${formatPercent(change.rate)}）`,
          ...sources.map((s) => `${s.key}: ${formatNumber(s.sessions)} セッション`),
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "A05",
    category: "traffic",
    name: "広告が増え、自然検索が減っている",
    severity: "high",
    defaultConfidence: "medium",
    fact: "広告経由のセッションが増える一方で、自然検索のセッションが減っている",
    possibleCauses: ["広告費で流入を維持していて、自然検索の地力が落ちている", "予算配分の変更"],
    requiredChecks: ["広告を止めたときに何セッション残るか", "広告と自然検索それぞれの問い合わせ率", "広告費と受注額"],
    recommendedActions: ["広告と自然検索を分けて、問い合わせ単価を比べる"],
    prohibitedConclusions: ["広告が悪いとは書かない（判断材料は費用対効果）"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      const d = ctx.derived.ga4;
      if (!g || !d || !ga4Comparable(ctx)) return null;
      const paidNow = g.channels.current.filter((c) => c.key.startsWith("Paid")).reduce((a, c) => a + c.sessions, 0);
      const paidBefore = g.channels.previous.filter((c) => c.key.startsWith("Paid")).reduce((a, c) => a + c.sessions, 0);
      if (paidNow < 20) return null;
      const paid = changeOf(paidNow, paidBefore);
      const organic = changeOf(d.organicSessions.current, d.organicSessions.previous);
      if (paid.rate === null || paid.rate < ctx.thresholds.majorIncreaseRate) return null;
      if (organic.rate === null || organic.rate > ctx.thresholds.majorDecreaseRate) return null;
      return {
        evidence: [
          `広告のセッション ${formatNumber(paidBefore)} → ${formatNumber(paidNow)}（${formatPercent(paid.rate)}）`,
          `自然検索のセッション ${formatNumber(organic.previous)} → ${formatNumber(organic.current)}（${formatPercent(organic.rate)}）`,
        ],
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "A06",
    category: "traffic",
    name: "新規ユーザーが増えている",
    severity: "low",
    defaultConfidence: "high",
    fact: "初めて訪れた人が前期より増えている",
    possibleCauses: ["認知が広がった", "非指名検索からの流入が増えた"],
    requiredChecks: ["新規ユーザーの着地ページ", "新規ユーザーの問い合わせ率"],
    recommendedActions: ["新規が増えている入口ページから、次に見てほしいページへの導線を強める"],
    prohibitedConclusions: ["新規ユーザーの増加を、そのまま見込み客の増加と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || !ga4Comparable(ctx)) return null;
      const change = changeOf(g.totals.current.newUsers, g.totals.previous.newUsers);
      if (change.rate === null || change.rate < ctx.thresholds.majorIncreaseRate) return null;
      return {
        evidence: [
          `新規ユーザー ${formatNumber(change.previous)} → ${formatNumber(change.current)}（${formatPercent(change.rate)}）`,
          `全ユーザーに占める新規の割合 ${formatPercent(g.totals.current.users > 0 ? g.totals.current.newUsers / g.totals.current.users : 0, 0)}`,
        ],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "A07",
    category: "traffic",
    name: "再訪ユーザーが中心",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "訪問者の多くが以前も来たことのある人で、新規が少ない",
    possibleCauses: ["既存顧客がサポート目的で使っている", "新規の認知が広がっていない", "比較検討中の人が何度も見に来ている"],
    requiredChecks: ["指名検索の比率", "サポート系ページの閲覧数", "新規ユーザーの問い合わせ率"],
    recommendedActions: ["新規向けの入口（サービスの一般名称で探される内容）を増やす"],
    prohibitedConclusions: ["再訪が多いことを、そのまま検討度の高さと読まない"],
    effort: "large",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || g.totals.current.users < ctx.thresholds.minimumSessions) return null;
      const share = g.totals.current.newUsers / g.totals.current.users;
      if (share >= 0.5) return null;
      return {
        evidence: [
          `新規ユーザーは ${formatNumber(g.totals.current.newUsers)} 人で、全 ${formatNumber(g.totals.current.users)} 人の ${formatPercent(share, 0)}`,
        ],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "A08",
    category: "traffic",
    name: "チャネルによって問い合わせ率が違う",
    severity: "high",
    defaultConfidence: "medium",
    fact: "流入元によって、キーイベント（問い合わせなど）の発生率に差がある",
    possibleCauses: ["チャネルごとに訪問者の検討段階が違う", "チャネルごとに着地ページが違う"],
    requiredChecks: ["各チャネルの着地ページ", "キーイベントの定義が正しいか", "実際の問い合わせ件数との一致"],
    recommendedActions: ["問い合わせ率の高いチャネルに予算と手間を寄せる", "率の低いチャネルは着地ページを見直す"],
    prohibitedConclusions: ["キーイベントを受注として扱わない", "母数の小さいチャネルの率で判断しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g) return null;
      const rows = g.channels.current.filter((c) => c.sessions >= Math.max(30, ctx.thresholds.minimumSessions / 3));
      if (rows.length < 2) return null;
      const rates = rows.map((c) => ({ ...c, rate: c.sessions > 0 ? c.keyEvents / c.sessions : 0 }));
      const sorted = [...rates].sort((a, b) => b.rate - a.rate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best.rate <= 0 || best.rate < worst.rate * 2) return null;
      return {
        evidence: sorted.map((c) => `${channelLabel(c.key)}: ${formatNumber(c.sessions)} セッション / キーイベント ${formatNumber(c.keyEvents)}（${formatPercent(c.rate)}）`),
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "A09",
    category: "traffic",
    name: "分類できない流入が増えている",
    severity: "medium",
    defaultConfidence: "high",
    fact: "チャネルが Unassigned（分類できず）のセッションがある",
    possibleCauses: ["UTM パラメータの書き方が GA4 の規則に合っていない", "計測タグの設定漏れ"],
    requiredChecks: ["UTM の utm_medium に使っている値", "どの参照元が分類できていないか"],
    recommendedActions: ["UTM の utm_medium を GA4 が認識する値（cpc / email / social / referral など）に揃える"],
    prohibitedConclusions: ["分類できない流入を、無価値な流入として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || g.totals.current.sessions === 0) return null;
      const un = channel(g.channels.current, "Unassigned");
      if (!un || un.sessions < 10) return null;
      const share = un.sessions / g.totals.current.sessions;
      if (share < 0.05) return null;
      return {
        evidence: [`分類できないセッションが ${formatNumber(un.sessions)}（全体の ${formatPercent(share, 0)}）`],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "A10",
    category: "traffic",
    name: "特定の流入元に依存している",
    severity: "medium",
    defaultConfidence: "high",
    fact: "1 つの参照元・メディアの組み合わせにセッションが集中している",
    possibleCauses: ["自然検索への依存（正常なこともある）", "1 つの広告キャンペーンへの依存", "1 つの紹介元への依存"],
    requiredChecks: ["その流入元が止まったときに何が残るか", "その流入元の継続性と費用"],
    recommendedActions: ["依存先が広告や紹介なら、自然検索など止まらない入口を育てる"],
    prohibitedConclusions: ["自然検索への集中を、そのまま危険と書かない"],
    effort: "large",
    evaluate: (ctx) => {
      const g = ga4(ctx);
      if (!g || g.totals.current.sessions < ctx.thresholds.minimumSessions) return null;
      const top = g.sources[0];
      if (!top) return null;
      const share = top.sessions / g.totals.current.sessions;
      if (share < 0.7) return null;
      return {
        evidence: [
          `${top.key} が ${formatNumber(top.sessions)} セッションで全体の ${formatPercent(share, 0)}`,
          ...g.sources.slice(1, 4).map((s) => `${s.key}: ${formatNumber(s.sessions)}`),
        ],
        impact: 0.5,
      };
    },
  }),
];
