/**
 * GA4 計測技術ルール M01〜M10（docs/dev/diagnosis-rules-spec.md §10.5）。
 *
 * 計測が壊れていると、他のすべての数字が信用できなくなる。だから重要度は高め。
 * ただし「壊れている」と断定できることは少ないので、確度は控えめにして
 * 「確認が必要なこと」を具体的に書く。
 */
import { formatNumber, formatPercent, rule } from "./helpers";
import { normalizeUrl } from "../normalize";
import type { DiagnosisContext, DiagnosisRule } from "../types";

function enough(ctx: DiagnosisContext): boolean {
  return (ctx.ga4?.totals.current.sessions ?? 0) >= ctx.thresholds.minimumSessions;
}

/** 自社のホスト名 */
function ownHost(ctx: DiagnosisContext): string | null {
  try {
    return new URL(ctx.origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const MEASUREMENT_RULES: DiagnosisRule[] = [
  rule({
    id: "M01",
    category: "measurement",
    name: "計測されていないページがある疑い",
    severity: "high",
    defaultConfidence: "low",
    fact: "クロールで見つけたページ数に対して、GA4 で表示が記録されているページが極端に少ない",
    possibleCauses: ["**一部のページに計測タグが入っていない**", "そのページに訪問が無いだけ", "同意管理で計測が止まっている"],
    requiredChecks: ["主要ページのソースに計測タグが入っているか", "同意バナーの設定", "そのページへの実際の訪問"],
    recommendedActions: ["主要ページを開いて、計測タグが読み込まれているか確認する（GA4 のリアルタイム）"],
    prohibitedConclusions: ["GA4 に出ないことだけでタグ未設置と断定しない（訪問が無いだけのこともある）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const measured = new Set(ctx.ga4.pages.filter((p) => p.views > 0).map((p) => normalizeUrl(p.path, ctx.origin)?.path ?? p.path));
      // GSC に出ているページのうち、GA4 に 1 度も出ていないもの
      const searched = (ctx.gsc?.pages.current ?? []).filter((p) => p.clicks >= 5);
      if (searched.length < 5) return null;
      const missing = searched.filter((p) => {
        const path = normalizeUrl(p.key)?.path;
        return path !== undefined && !measured.has(path);
      });
      const share = missing.length / searched.length;
      if (share < 0.3) return null;
      return {
        evidence: [
          `検索から 5 クリック以上あるページ ${searched.length} 件のうち、${missing.length} 件（${formatPercent(share, 0)}）が GA4 の表示回数に出てきません`,
          ...missing.slice(0, 5).map((p) => `${normalizeUrl(p.key)?.path ?? p.key}: 検索クリック ${formatNumber(p.clicks)}`),
        ],
        subjects: missing.slice(0, 10).map((p) => p.key),
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "M02",
    category: "measurement",
    name: "二重計測の疑い",
    severity: "high",
    defaultConfidence: "low",
    fact: "1 セッションあたりのページ表示回数が不自然に多い",
    possibleCauses: ["**計測タグが 2 か所に入っている**（GTM と直書きの重複）", "実際によく回遊されている"],
    requiredChecks: ["ページのソースに計測タグが 2 つ入っていないか", "GTM の中に GA4 設定タグが複数ないか"],
    recommendedActions: ["ページのソースで計測 ID を検索し、1 つだけであることを確認する"],
    prohibitedConclusions: ["回遊が多いだけの可能性を排除しない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const views = ctx.ga4.pages.reduce((a, p) => a + p.views, 0);
      const sessions = ctx.ga4.totals.current.sessions;
      if (sessions === 0) return null;
      const perSession = views / sessions;
      if (perSession < 8) return null;
      return {
        evidence: [`表示回数 ${formatNumber(views)} ÷ セッション ${formatNumber(sessions)} = 1 訪問あたり ${perSession.toFixed(1)} ページ`],
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "M03",
    category: "measurement",
    name: "問い合わせの完了が取れていない（フォームはあるのに）",
    severity: "critical",
    defaultConfidence: "medium",
    fact: "フォームの入力開始は計測できているのに、完了のイベントが無い",
    possibleCauses: ["完了が画面遷移を伴わない（Ajax 送信）", "外部のフォームサービスへ移動している", "完了ページに計測タグが入っていない"],
    requiredChecks: ["送信後に URL が変わるか", "外部サービスを使っているか", "完了ページのタグ"],
    recommendedActions: ["送信ボタンのクリックではなく、送信成功の表示をトリガーにして計測する", "外部フォームならクロスドメイン測定を設定する"],
    prohibitedConclusions: ["完了が 0 件であることと、計測されていないことを混同しない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const hasStart = ctx.ga4.mapping.form_start.length > 0;
      const hasComplete = ctx.ga4.mapping.form_complete.length > 0;
      if (!hasStart || hasComplete) return null;
      return {
        evidence: [
          `フォーム入力開始は計測されています（${ctx.ga4.mapping.form_start.join(" / ")}）`,
          "完了に当たるイベントがありません",
        ],
        impact: 1,
      };
    },
  }),

  rule({
    id: "M04",
    category: "measurement",
    name: "外部ドメインでセッションが切れている疑い",
    severity: "high",
    defaultConfidence: "low",
    fact: "自社サイトのドメインが、参照元（他サイトからの流入）として記録されている",
    possibleCauses: ["**クロスドメイン測定が設定されていない**", "決済・予約・フォームの外部サービスを挟んでいる", "サブドメイン間の移動が別サイト扱いになっている"],
    requiredChecks: ["外部サービスを挟む導線があるか", "GA4 の「ドメインの設定」", "除外する参照のリスト"],
    recommendedActions: ["GA4 の管理 → データストリーム → タグ設定 → ドメインの設定に、関係するドメインをすべて入れる"],
    prohibitedConclusions: ["自己参照が出ていることだけで、すべての数字が壊れていると書かない"],
    effort: "medium",
    evaluate: (ctx) => {
      const host = ownHost(ctx);
      if (!ctx.ga4 || !host) return null;
      const self = ctx.ga4.sources.filter((s) => s.key.toLowerCase().includes(host) && !s.key.includes("organic"));
      if (self.length === 0) return null;
      const sessions = self.reduce((a, s) => a + s.sessions, 0);
      if (sessions < 5) return null;
      return {
        evidence: [
          `自社ドメインが参照元として ${formatNumber(sessions)} セッション分記録されています`,
          ...self.slice(0, 3).map((s) => `${s.key}: ${formatNumber(s.sessions)}`),
        ],
        subjects: self.slice(0, 5).map((s) => s.key),
        impact: 0.6,
      };
    },
  }),

  rule({
    id: "M05",
    category: "measurement",
    name: "参照元に決済・予約サービスが入っている",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "決済や予約の外部サービスが、参照元として記録されている",
    possibleCauses: ["外部サービスから戻ってきたときに、新しいセッションとして数えられている"],
    requiredChecks: ["その外部サービスを導線に使っているか"],
    recommendedActions: ["除外する参照のリストにそのドメインを追加する"],
    prohibitedConclusions: ["その参照元からの流入を、新規の流入として数えない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const known = /paypal|stripe|square|gmo|paidy|rakuten-?card|amazon\.co|checkout|booking|reserva|airrsv|coubic|square|payment/i;
      const rows = ctx.ga4.sources.filter((s) => known.test(s.key));
      if (rows.length === 0) return null;
      return {
        evidence: rows.slice(0, 5).map((s) => `${s.key}: ${formatNumber(s.sessions)} セッション`),
        subjects: rows.slice(0, 5).map((s) => s.key),
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "M07",
    category: "measurement",
    name: "参照元・メディアの表記が揺れている",
    severity: "medium",
    defaultConfidence: "high",
    fact: "大文字小文字だけが違う参照元・メディアが別々に記録されている",
    possibleCauses: ["UTM パラメータを手作業で付けていて、書き方が揃っていない"],
    requiredChecks: ["社外に配っている URL の UTM"],
    recommendedActions: ["UTM はすべて小文字に統一し、書き方の一覧を作って共有する"],
    prohibitedConclusions: [],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4) return null;
      const byLower = new Map<string, string[]>();
      for (const s of ctx.ga4.sources) {
        const key = s.key.toLowerCase();
        const list = byLower.get(key) ?? [];
        if (!list.includes(s.key)) list.push(s.key);
        byLower.set(key, list);
      }
      const dupes = [...byLower.values()].filter((v) => v.length > 1);
      if (dupes.length === 0) return null;
      return {
        evidence: dupes.slice(0, 3).map((v) => v.join(" と ")),
        subjects: dupes.flat().slice(0, 10),
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "M09",
    category: "measurement",
    name: "ユーザー単位とセッション単位の取り違えに注意",
    severity: "low",
    defaultConfidence: "high",
    fact: "ユーザー数とセッション数の差が大きい",
    possibleCauses: ["同じ人が何度も訪れている（正常）"],
    requiredChecks: ["報告書で使っている数字が、ユーザー単位かセッション単位か"],
    recommendedActions: ["集客の話はセッション単位、認知の話はユーザー単位と決めて混ぜない"],
    prohibitedConclusions: ["ユーザー獲得（新規ユーザー単位）とトラフィック獲得（セッション単位）を混同しない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const { sessions, users } = ctx.ga4.totals.current;
      if (users === 0 || sessions / users < 1.8) return null;
      return {
        evidence: [`セッション ${formatNumber(sessions)} / ユーザー ${formatNumber(users)} = 1 人あたり ${(sessions / users).toFixed(1)} 回訪問`],
        impact: 0.2,
      };
    },
  }),

  rule({
    id: "M10",
    category: "measurement",
    name: "共通イベントに当てられないイベント名がある",
    severity: "medium",
    defaultConfidence: "high",
    fact: "GA4 に記録されているイベントのうち、問い合わせ導線として分類できなかったものがある",
    possibleCauses: ["イベント名が独特で、自動判定の語に当てはまらない", "そもそも問い合わせ導線ではないイベント"],
    requiredChecks: ["そのイベントが何を計測しているか"],
    recommendedActions: ["設定画面で、該当するイベントを共通イベント（問い合わせクリック / フォーム開始 / フォーム完了など）に割り当てる"],
    prohibitedConclusions: ["分類できないイベントを、無いものとして扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || ctx.ga4.unmapped.length === 0) return null;
      const rows = ctx.ga4.events.filter((e) => ctx.ga4!.unmapped.includes(e.name)).sort((a, b) => b.count - a.count);
      if (rows.length === 0) return null;
      return {
        evidence: [
          `共通イベントに当てられなかったイベントが ${rows.length} 件`,
          ...rows.slice(0, 8).map((e) => `${e.name}: ${formatNumber(e.count)} 回 / ${formatNumber(e.sessions)} セッション${e.keyEvents > 0 ? "（キーイベント指定あり）" : ""}`),
        ],
        subjects: rows.slice(0, 10).map((e) => e.name),
        impact: 0.4,
      };
    },
  }),
];

/** 判定に別のデータが要るもの */
export const MEASUREMENT_PENDING = [
  { id: "M06", name: "UTM の欠落", needs: "社外に配っている URL の一覧" },
  { id: "M08", name: "同意前後での計測差", needs: "同意管理ツールの設定（GA4 からは判定できない）" },
] as const;
