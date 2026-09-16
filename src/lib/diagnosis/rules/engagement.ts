/**
 * GA4 エンゲージメントルール E01〜E10（docs/dev/diagnosis-rules-spec.md §10.3）。
 *
 * GA4 のエンゲージメント率は「10 秒以上の滞在 / 2 ページ以上の閲覧 / キーイベント発生」
 * のいずれかを満たしたセッションの割合。滞在時間が長いだけで良いページとは書かない、
 * 直帰率が高いだけで悪いページとは書かない（§18）。
 */
import { changeOf, formatNumber, formatPercent, rule } from "./helpers";
import { normalizeUrl } from "../normalize";
import { purposeOf } from "./page";
import type { DiagnosisContext, DiagnosisRule } from "../types";

function enough(ctx: DiagnosisContext): boolean {
  return (ctx.ga4?.totals.current.sessions ?? 0) >= ctx.thresholds.minimumSessions;
}

function rateOf(ctx: DiagnosisContext): { current: number | null; previous: number | null } {
  return ctx.derived.ga4?.engagementRate ?? { current: null, previous: null };
}

/** 用途ごとのページ（ページ・スクリーンの行） */
function pagesOfPurpose(ctx: DiagnosisContext, purpose: ReturnType<typeof purposeOf>) {
  return (ctx.ga4?.pages ?? []).filter((p) => purposeOf(`${ctx.origin}${normalizeUrl(p.path, ctx.origin)?.path ?? p.path}`) === purpose);
}

export const ENGAGEMENT_RULES: DiagnosisRule[] = [
  rule({
    id: "E01",
    category: "engagement",
    name: "訪問が増え、読まれ方も保たれている",
    severity: "low",
    defaultConfidence: "high",
    fact: "セッションが増えて、エンゲージメント率は下がっていない",
    possibleCauses: ["増えた流入が、もともとの訪問者と同じ関心を持っている"],
    requiredChecks: ["増えた流入からの問い合わせ"],
    recommendedActions: ["増えている入口ページの問い合わせ導線を強める"],
    prohibitedConclusions: ["読まれていることを、そのまま成果と書かない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const sessions = changeOf(ctx.ga4.totals.current.sessions, ctx.ga4.totals.previous.sessions);
      const rate = rateOf(ctx);
      if (sessions.rate === null || sessions.rate < ctx.thresholds.majorIncreaseRate) return null;
      if (rate.current === null || rate.previous === null || rate.current < rate.previous * 0.95) return null;
      return {
        evidence: [
          `セッション ${formatNumber(sessions.previous)} → ${formatNumber(sessions.current)}（${formatPercent(sessions.rate)}）`,
          `エンゲージメント率 ${formatPercent(rate.previous, 0)} → ${formatPercent(rate.current, 0)}`,
        ],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "E02",
    category: "engagement",
    name: "訪問は増えたが、読まれ方が落ちている",
    severity: "high",
    defaultConfidence: "high",
    fact: "セッションが増える一方で、エンゲージメント率が下がっている",
    possibleCauses: ["増えた流入の検索意図とページが合っていない", "対象外の地域・目的の訪問が増えた", "広告やSNSからの、検討段階の浅い流入が増えた"],
    requiredChecks: ["増えたチャネルと着地ページ", "増えた流入の検索語"],
    recommendedActions: ["増えた流入の着地ページを見て、そこで求められている情報が書かれているか確かめる"],
    prohibitedConclusions: ["流入増加をそのまま成果として報告しない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const sessions = changeOf(ctx.ga4.totals.current.sessions, ctx.ga4.totals.previous.sessions);
      const rate = rateOf(ctx);
      if (sessions.rate === null || sessions.rate < ctx.thresholds.majorIncreaseRate) return null;
      if (rate.current === null || rate.previous === null || rate.current >= rate.previous * 0.9) return null;
      return {
        evidence: [
          `セッション ${formatNumber(sessions.previous)} → ${formatNumber(sessions.current)}（${formatPercent(sessions.rate)}）`,
          `エンゲージメント率 ${formatPercent(rate.previous, 0)} → ${formatPercent(rate.current, 0)}`,
        ],
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "E03",
    category: "engagement",
    name: "訪問は減ったが、読まれ方は上がっている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "セッションが減る一方で、エンゲージメント率は上がっている",
    possibleCauses: ["関係の薄い流入が減った（質が上がった）", "対象外の露出が減った"],
    requiredChecks: ["問い合わせ件数が減っていないか", "減ったチャネル"],
    recommendedActions: ["問い合わせ数で見て実害が無いか確かめてから、量を戻すかどうか判断する"],
    prohibitedConclusions: ["流入減少をそのまま悪化と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const sessions = changeOf(ctx.ga4.totals.current.sessions, ctx.ga4.totals.previous.sessions);
      const rate = rateOf(ctx);
      if (sessions.rate === null || sessions.rate > ctx.thresholds.majorDecreaseRate) return null;
      if (rate.current === null || rate.previous === null || rate.current <= rate.previous * 1.05) return null;
      return {
        evidence: [
          `セッション ${formatNumber(sessions.previous)} → ${formatNumber(sessions.current)}（${formatPercent(sessions.rate)}）`,
          `エンゲージメント率 ${formatPercent(rate.previous, 0)} → ${formatPercent(rate.current, 0)}`,
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "E04",
    category: "engagement",
    name: "商品・サービスページがよく読まれている",
    severity: "low",
    defaultConfidence: "medium",
    fact: "商品・サービスページの平均エンゲージメント時間が長い",
    possibleCauses: ["内容が検討の役に立っている"],
    requiredChecks: ["そのページからの CTA クリック", "そのページからの問い合わせ"],
    recommendedActions: ["読まれているページに、事例・価格の目安・相談の入口を足す"],
    prohibitedConclusions: ["滞在時間が長いだけで良いページと断定しない（迷っている可能性もある）"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const rows = pagesOfPurpose(ctx, "product").filter((p) => p.views >= 50 && p.engagementSeconds >= 60);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.views - a.views);
      return {
        evidence: sorted.slice(0, 5).map((p) => `${p.path}: 表示 ${formatNumber(p.views)} / 平均エンゲージメント時間 ${p.engagementSeconds.toFixed(0)} 秒`),
        subjects: sorted.slice(0, 10).map((p) => p.path),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "E05",
    category: "engagement",
    name: "商品・サービスページが読まれていない",
    severity: "high",
    defaultConfidence: "medium",
    fact: "商品・サービスページの平均エンゲージメント時間が短い",
    possibleCauses: ["最初の画面で何のページか分からない", "知りたいこと（価格・条件・実績）が無い", "表示が遅い", "検索意図と合っていない"],
    requiredChecks: ["ページの最初の画面に何が見えているか", "実ユーザーの表示速度", "そのページに紐づく検索語"],
    recommendedActions: ["最初の画面に「誰の何を解決するか」「価格の目安」「実績の数字」を置く"],
    prohibitedConclusions: ["滞在時間が短いだけで内容が悪いと断定しない（探していた情報がすぐ見つかった可能性もある）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const rows = pagesOfPurpose(ctx, "product").filter((p) => p.views >= 50 && p.engagementSeconds < 20);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.views - a.views);
      return {
        evidence: sorted.slice(0, 5).map((p) => `${p.path}: 表示 ${formatNumber(p.views)} / 平均エンゲージメント時間 ${p.engagementSeconds.toFixed(0)} 秒`),
        subjects: sorted.slice(0, 10).map((p) => p.path),
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "E07",
    category: "engagement",
    name: "1 訪問あたりの閲覧ページ数が少ない",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "1 セッションあたりに見られているページ数が 1 に近い",
    possibleCauses: ["1 ページで完結する内容（正常なこともある）", "次に見るべきページへの導線が無い", "検索意図と合っていない"],
    requiredChecks: ["着地ページに次への導線があるか", "エンゲージメント率"],
    recommendedActions: ["主要ページの本文中に、次に見てほしいページへのリンクを 1 つ置く"],
    prohibitedConclusions: ["ページ数が少ないだけで悪いと断定しない（目的が果たせていれば問題ない）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const views = ctx.ga4.pages.reduce((a, p) => a + p.views, 0);
      const sessions = ctx.ga4.totals.current.sessions;
      if (sessions === 0 || views === 0) return null;
      const perSession = views / sessions;
      if (perSession >= 1.5) return null;
      return {
        evidence: [`表示回数 ${formatNumber(views)} ÷ セッション ${formatNumber(sessions)} = 1 訪問あたり ${perSession.toFixed(2)} ページ`],
        impact: 0.5,
      };
    },
  }),

  rule({
    id: "E08",
    category: "engagement",
    name: "たくさん見られているのに、問い合わせが起きていない",
    severity: "high",
    defaultConfidence: "medium",
    fact: "1 訪問あたりの閲覧ページ数が多いのに、キーイベントがほとんど発生していない",
    possibleCauses: ["探している情報が見つからず回遊している", "価格や条件が書かれていない", "問い合わせの入口が分かりにくい", "キーイベントが設定されていない"],
    requiredChecks: ["キーイベントの設定", "よく見られているページの並び", "価格・条件の記載"],
    recommendedActions: ["よく見られている順にページを並べ、その流れで答えていない疑問を埋める"],
    prohibitedConclusions: ["回遊が多いことを、そのまま関心の高さと読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const views = ctx.ga4.pages.reduce((a, p) => a + p.views, 0);
      const sessions = ctx.ga4.totals.current.sessions;
      if (sessions === 0) return null;
      const perSession = views / sessions;
      const keyRate = ctx.ga4.totals.current.keyEvents / sessions;
      if (perSession < 3 || keyRate >= 0.005) return null;
      return {
        evidence: [
          `1 訪問あたり ${perSession.toFixed(1)} ページ見られています`,
          `キーイベントは ${formatNumber(ctx.ga4.totals.current.keyEvents)} 件（セッションあたり ${formatPercent(keyRate)}）`,
        ],
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "E09",
    category: "engagement",
    name: "エンゲージメント時間だけが極端に長い",
    severity: "low",
    defaultConfidence: "low",
    fact: "平均エンゲージメント時間が非常に長いページがある",
    possibleCauses: ["じっくり読まれている", "**タブを開いたまま放置されている**", "計測の仕方によるもの"],
    requiredChecks: ["そのページからの次の行動", "実際に読むのにかかる時間"],
    recommendedActions: ["時間ではなく、次の行動（CTA クリック・別ページへの移動）で判断する"],
    prohibitedConclusions: ["滞在時間が長いだけで良いページと断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const rows = ctx.ga4.pages.filter((p) => p.views >= 30 && p.engagementSeconds >= 300);
      if (rows.length === 0) return null;
      const sorted = [...rows].sort((a, b) => b.engagementSeconds - a.engagementSeconds);
      return {
        evidence: sorted.slice(0, 5).map((p) => `${p.path}: 平均 ${Math.round(p.engagementSeconds / 60)} 分（表示 ${formatNumber(p.views)}）`),
        subjects: sorted.slice(0, 10).map((p) => p.path),
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "E10",
    category: "engagement",
    name: "特定のデバイスだけ成果が出ていない",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "デバイスによってキーイベントの発生率に差がある",
    possibleCauses: ["そのデバイスでフォームが使いにくい", "そのデバイスで問い合わせボタンが見えていない", "デバイスによって訪問者の目的が違う"],
    requiredChecks: ["そのデバイスでの実機確認", "フォームの入力しやすさ"],
    recommendedActions: ["成果の低いデバイスで、実際に最後まで問い合わせを試してみる"],
    prohibitedConclusions: ["デバイス差を、そのままデザインの問題と断定しない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const rows = ctx.ga4.devices.current.filter((d) => d.sessions >= 50);
      if (rows.length < 2) return null;
      const rates = rows.map((d) => ({ ...d, rate: d.keyEvents / d.sessions }));
      const sorted = [...rates].sort((a, b) => b.rate - a.rate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best.rate <= 0 || best.rate < worst.rate * 2) return null;
      return {
        evidence: sorted.map((d) => `${d.key}: ${formatNumber(d.sessions)} セッション / キーイベント ${formatNumber(d.keyEvents)}（${formatPercent(d.rate)}）`),
        impact: 0.5,
      };
    },
  }),
];

/** 別の切り口のデータが要るもの */
export const ENGAGEMENT_PENDING = [{ id: "E06", name: "記事は読まれるが商品ページへ移動しない", needs: "GA4 のページ遷移（経路データ）" }] as const;
