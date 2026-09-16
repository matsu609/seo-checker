/**
 * GA4 CTA・フォームルール K01〜K12（docs/dev/diagnosis-rules-spec.md §10.4）。
 *
 * ここが「問い合わせが来ない」の原因を切り分ける部分。
 *   見た → CTA を押した → フォームを開いた → 送信した
 * のどこで落ちているかを、共通イベント（§5）に寄せた数で判定する。
 *
 * 数え方の注意:
 * - 「セッション数」で数える。イベント数（1 人が 3 回押せば 3）ではない。
 * - イベント数を問い合わせ人数として扱わない（§18）。
 * - 共通イベントに当たるイベントが無い場合と、0 件だった場合を区別する
 *   （前者は計測が無い、後者は押されていない）。
 */
import { COMMON_EVENT_LABELS, type CommonEvent } from "../events";
import { formatNumber, formatPercent, rule } from "./helpers";
import type { DiagnosisContext, DiagnosisRule } from "../types";

function d(ctx: DiagnosisContext) {
  return ctx.derived.ga4;
}

/** その共通イベントに当たる GA4 イベントが設定されているか */
function mapped(ctx: DiagnosisContext, event: CommonEvent): boolean {
  return (ctx.ga4?.mapping[event].length ?? 0) > 0;
}

function mappingNote(ctx: DiagnosisContext, event: CommonEvent): string {
  const names = ctx.ga4?.mapping[event] ?? [];
  return names.length > 0 ? `${COMMON_EVENT_LABELS[event]}として数えたイベント: ${names.join(" / ")}` : `${COMMON_EVENT_LABELS[event]}に当たるイベントがありません`;
}

function enough(ctx: DiagnosisContext): boolean {
  return (ctx.ga4?.totals.current.sessions ?? 0) >= ctx.thresholds.minimumSessions;
}

export const CTA_RULES: DiagnosisRule[] = [
  rule({
    id: "K01",
    category: "cta",
    name: "問い合わせ導線のクリックが計測できていない",
    severity: "critical",
    defaultConfidence: "high",
    fact: "問い合わせボタンのクリックに当たるイベントが、GA4 に 1 件も無い",
    possibleCauses: ["**クリックの計測を設定していない**", "問い合わせボタンが設置されていない", "イベント名が独特で、共通イベントに当てられていない"],
    requiredChecks: ["GA4 のイベント一覧", "サイトに問い合わせボタンがあるか", "GTM のタグ設定"],
    recommendedActions: ["問い合わせボタンのクリックを GA4 のイベントとして計測する（GTM のクリックトリガー）", "イベント名が独特なら、設定画面で共通イベントに割り当てる"],
    prohibitedConclusions: ["イベントが無いことを、押されていないことと同じに扱わない（計測していないだけの可能性が高い）"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      if (mapped(ctx, "primary_cta")) return null;
      const unmapped = ctx.ga4.unmapped;
      return {
        evidence: [
          "問い合わせ導線のクリックに当たるイベントがありません",
          unmapped.length > 0 ? `共通イベントに当てられていないイベント名: ${unmapped.slice(0, 8).join(" / ")}` : "GA4 に計測されているカスタムイベントもありません",
        ],
        impact: 1,
      };
    },
  }),

  rule({
    id: "K02",
    category: "cta",
    name: "問い合わせ導線のクリック率が低い",
    severity: "high",
    defaultConfidence: "medium",
    fact: "訪問に対して、問い合わせボタンが押された割合が低い",
    possibleCauses: ["ボタンが画面の下のほうにしかない", "何が得られるか（無料・所要時間・返答期限）が書かれていない", "価格や条件が分からず判断できない", "検討段階の浅い訪問者が多い"],
    requiredChecks: ["主要ページの最初の画面にボタンが見えているか", "ボタンの文言", "訪問者の検討段階（検索語）"],
    recommendedActions: ["主要ページの最初の画面と本文の途中にもボタンを置く", "ボタンの文言を「お問い合わせ」から「◯分で分かる料金の目安を相談する」のように具体にする"],
    prohibitedConclusions: ["クリック率が低いだけでボタンのデザインの問題と断定しない"],
    effort: "small",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!ctx.ga4 || !derived || !enough(ctx) || !mapped(ctx, "primary_cta")) return null;
      if (derived.ctaClickRate === null || derived.ctaClickRate >= 0.02) return null;
      return {
        evidence: [
          `問い合わせ導線が押されたセッション ${formatNumber(derived.eventSessions.primary_cta)} ÷ 全セッション ${formatNumber(ctx.ga4.totals.current.sessions)} = ${formatPercent(derived.ctaClickRate)}`,
          mappingNote(ctx, "primary_cta"),
        ],
        impact: 0.8,
      };
    },
  }),

  rule({
    id: "K03",
    category: "cta",
    name: "問い合わせ導線のクリック率が高い",
    severity: "low",
    defaultConfidence: "medium",
    fact: "訪問に対して、問い合わせボタンがよく押されている",
    possibleCauses: ["訴求が伝わっている", "検討段階の進んだ訪問者が多い"],
    requiredChecks: ["押したあとにフォームまで進んでいるか"],
    recommendedActions: ["押されたあとの離脱が無いか（K04・K05）を確かめる"],
    prohibitedConclusions: ["クリックの多さを、そのまま問い合わせ数と読まない"],
    effort: "small",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!ctx.ga4 || !derived || !enough(ctx) || !mapped(ctx, "primary_cta")) return null;
      if (derived.ctaClickRate === null || derived.ctaClickRate < 0.08) return null;
      return {
        evidence: [
          `問い合わせ導線が押されたセッションの割合 ${formatPercent(derived.ctaClickRate)}`,
          mappingNote(ctx, "primary_cta"),
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "K04",
    category: "cta",
    name: "ボタンは押されるが、フォームの入力が始まらない",
    severity: "critical",
    defaultConfidence: "medium",
    fact: "問い合わせボタンは押されているのに、フォームの入力開始がほとんど無い",
    possibleCauses: ["**ボタンの遷移先がフォームではない**（別のページや外部サイト）", "遷移先で何を書けばよいか分からない", "入力項目が多くて始める前に諦めている", "ページが重くて表示される前に離脱している"],
    requiredChecks: ["ボタンを押したときに実際にどこへ行くか", "遷移先ページの入力項目数", "遷移先ページの表示速度"],
    recommendedActions: ["実際にボタンを押して、フォームまで何回の操作がかかるか数える", "遷移先の最初に「所要 1 分・必須 3 項目」のように負担の少なさを書く"],
    prohibitedConclusions: ["フォーム開始が計測されていないだけの可能性を排除しない"],
    effort: "medium",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!ctx.ga4 || !derived || !mapped(ctx, "primary_cta")) return null;
      if (derived.eventSessions.primary_cta < 20) return null;
      if (!mapped(ctx, "form_start")) return null;
      if (derived.formStartRate === null || derived.formStartRate >= 0.3) return null;
      return {
        evidence: [
          `ボタンが押されたセッション ${formatNumber(derived.eventSessions.primary_cta)} に対し、フォーム入力開始は ${formatNumber(derived.eventSessions.form_start)} セッション（${formatPercent(derived.formStartRate, 0)}）`,
          mappingNote(ctx, "primary_cta"),
          mappingNote(ctx, "form_start"),
        ],
        impact: 0.9,
      };
    },
  }),

  rule({
    id: "K05",
    category: "cta",
    name: "フォームの入力は始まるが、完了しない",
    severity: "critical",
    defaultConfidence: "high",
    fact: "フォームの入力を始めた人のうち、送信まで到達した割合が低い",
    possibleCauses: ["入力項目が多い", "入力エラーの表示が分かりにくい", "必須項目が多すぎる（電話番号・住所・予算）", "スマートフォンで入力しづらい", "確認画面で戻ってしまう"],
    requiredChecks: ["フォームの項目数と必須の数", "スマートフォンでの入力しやすさ", "エラーメッセージの出方", "送信ボタンの位置"],
    recommendedActions: ["必須項目を減らす（名前・連絡先・用件の 3 つまで）", "スマートフォンで最後まで入力してみる", "エラーはその場で、何が悪いか分かる文言で出す"],
    prohibitedConclusions: ["完了イベントの計測漏れの可能性を排除しない（K06 も合わせて見る）"],
    effort: "medium",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!ctx.ga4 || !derived || !mapped(ctx, "form_start") || !mapped(ctx, "form_complete")) return null;
      if (derived.eventSessions.form_start < 10) return null;
      if (derived.formCompletionRate === null || derived.formCompletionRate >= ctx.thresholds.lowFormCompletionRate) return null;
      return {
        evidence: [
          `フォーム入力開始 ${formatNumber(derived.eventSessions.form_start)} セッションに対し、完了は ${formatNumber(derived.eventSessions.form_complete)} セッション（${formatPercent(derived.formCompletionRate, 0)}）`,
          `判定の目安（${formatPercent(ctx.thresholds.lowFormCompletionRate, 0)}）を下回っています`,
          mappingNote(ctx, "form_complete"),
        ],
        impact: 1,
      };
    },
  }),

  rule({
    id: "K06",
    category: "cta",
    name: "フォームの完了が計測できていない",
    severity: "critical",
    defaultConfidence: "high",
    fact: "問い合わせ完了に当たるイベントが、GA4 に 1 件も無い",
    possibleCauses: ["**完了の計測を設定していない**", "完了ページが無く、画面遷移せずに送信している（Ajax）", "外部のフォームサービスを使っていて計測が届いていない"],
    requiredChecks: ["問い合わせを実際に送ってみて、GA4 のリアルタイムに出るか", "完了ページの URL があるか", "外部フォームを使っているか"],
    recommendedActions: ["送信完了を GA4 のイベント（generate_lead）として計測する", "完了ページがあれば、その URL の表示をトリガーにする", "外部フォームならクロスドメイン測定を設定する"],
    prohibitedConclusions: ["計測が無いことを、問い合わせが 0 件であることと同じに扱わない"],
    effort: "medium",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      if (mapped(ctx, "form_complete")) return null;
      return {
        evidence: [
          "問い合わせ完了に当たるイベントがありません",
          ctx.ga4.unmapped.length > 0 ? `共通イベントに当てられていないイベント名: ${ctx.ga4.unmapped.slice(0, 8).join(" / ")}` : "GA4 にカスタムイベントが計測されていません",
        ],
        impact: 1,
      };
    },
  }),

  rule({
    id: "K07",
    category: "cta",
    name: "フォームの完了が二重に発火している疑い",
    severity: "medium",
    defaultConfidence: "low",
    fact: "完了イベントの発生回数が、それが起きたセッション数よりかなり多い",
    possibleCauses: ["完了ページの再読み込みで何度も発火している", "タグが 2 か所に入っている", "戻るボタンで再発火している"],
    requiredChecks: ["完了ページを再読み込みしたときに発火するか", "GTM のタグが重複していないか"],
    recommendedActions: ["完了イベントを 1 セッション 1 回に制限する（GTM のトリガーを 1 回に）"],
    prohibitedConclusions: ["イベント数を問い合わせ人数として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!derived || !mapped(ctx, "form_complete")) return null;
      const sessions = derived.eventSessions.form_complete;
      const count = derived.eventCounts.form_complete;
      if (sessions < 5 || count < sessions * 1.5) return null;
      return {
        evidence: [`完了イベントの発生 ${formatNumber(count)} 回に対し、発生したセッションは ${formatNumber(sessions)}（1 セッションあたり ${(count / sessions).toFixed(1)} 回）`],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "K08",
    category: "cta",
    name: "電話のクリックが中心",
    severity: "low",
    defaultConfidence: "medium",
    fact: "フォームの完了より、電話番号のクリックのほうが多い",
    possibleCauses: ["急いでいる客層", "スマートフォンからの訪問が中心", "フォームが使いにくい"],
    requiredChecks: ["電話の受付時間と、クリックが起きている時間帯", "電話からの受注の記録"],
    recommendedActions: ["電話番号を全ページの見える位置に置き、受付時間を明記する", "電話の問い合わせ件数も成果として数える"],
    prohibitedConclusions: ["電話クリック数を、そのまま通話数として扱わない（押しただけの人もいる）"],
    effort: "small",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!derived || !mapped(ctx, "phone_action")) return null;
      const phone = derived.eventSessions.phone_action;
      if (phone < 10 || phone <= derived.eventSessions.form_complete) return null;
      return {
        evidence: [
          `電話番号のクリック ${formatNumber(phone)} セッション / フォーム完了 ${formatNumber(derived.eventSessions.form_complete)} セッション`,
          mappingNote(ctx, "phone_action"),
        ],
        impact: 0.3,
      };
    },
  }),

  rule({
    id: "K09",
    category: "cta",
    name: "資料ダウンロードが中心",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "問い合わせよりも、資料・カタログのダウンロードのほうが多い",
    possibleCauses: ["まだ比較検討の段階の人が多い", "問い合わせの心理的な負担が大きい"],
    requiredChecks: ["ダウンロードした人のその後（商談になっているか）", "ダウンロード時に連絡先を取得しているか"],
    recommendedActions: ["ダウンロード時に連絡先を取得し、その後の案内につなげる", "資料の最後に相談の入口を置く"],
    prohibitedConclusions: ["ダウンロード数を見込み客数として扱わない"],
    effort: "medium",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!derived || !mapped(ctx, "document_download")) return null;
      const dl = derived.eventSessions.document_download;
      if (dl < 10 || dl <= derived.eventSessions.form_complete * 2) return null;
      return {
        evidence: [
          `資料ダウンロード ${formatNumber(dl)} セッション / フォーム完了 ${formatNumber(derived.eventSessions.form_complete)} セッション`,
          mappingNote(ctx, "document_download"),
        ],
        impact: 0.4,
      };
    },
  }),

  rule({
    id: "K11",
    category: "cta",
    name: "キーイベントの数が不自然に多い",
    severity: "high",
    defaultConfidence: "medium",
    fact: "キーイベントの発生回数がセッション数に対して多すぎる",
    possibleCauses: ["**スクロールやクリックなど、成果ではないイベントをキーイベントに指定している**", "イベントが二重に発火している"],
    requiredChecks: ["GA4 の管理 → キーイベント の一覧", "どのイベントがキーイベントになっているか"],
    recommendedActions: ["キーイベントを、本当に成果と呼べるもの（問い合わせ完了・購入）だけに絞る"],
    prohibitedConclusions: ["キーイベントを受注として扱わない"],
    effort: "small",
    evaluate: (ctx) => {
      if (!ctx.ga4 || !enough(ctx)) return null;
      const sessions = ctx.ga4.totals.current.sessions;
      const keyEvents = ctx.ga4.totals.current.keyEvents;
      if (sessions === 0 || keyEvents / sessions < 0.5) return null;
      const keyed = ctx.ga4.events.filter((e) => e.keyEvents > 0).sort((a, b) => b.keyEvents - a.keyEvents);
      return {
        evidence: [
          `キーイベント ${formatNumber(keyEvents)} 件 ÷ セッション ${formatNumber(sessions)} = 1 セッションあたり ${(keyEvents / sessions).toFixed(2)} 件`,
          `キーイベントに指定されているもの: ${keyed.slice(0, 6).map((e) => `${e.name}（${formatNumber(e.keyEvents)}）`).join(" / ") || "不明"}`,
        ],
        impact: 0.7,
      };
    },
  }),

  rule({
    id: "K12",
    category: "cta",
    name: "手前の行動だけが増えている",
    severity: "medium",
    defaultConfidence: "medium",
    fact: "ボタンのクリックや資料ダウンロードはあるのに、問い合わせの完了に結びついていない",
    possibleCauses: ["検討段階の途中で止まっている", "問い合わせの負担が大きい", "完了の計測漏れ"],
    requiredChecks: ["各段階のセッション数", "フォームの項目数", "完了イベントの計測"],
    recommendedActions: ["段階ごとの数を並べ、いちばん落ちている場所だけを直す"],
    prohibitedConclusions: ["手前の行動を、そのまま見込み客の数と読まない"],
    effort: "medium",
    evaluate: (ctx) => {
      const derived = d(ctx);
      if (!derived || !mapped(ctx, "form_complete")) return null;
      const micro = derived.eventSessions.primary_cta + derived.eventSessions.document_download;
      if (micro < 30 || derived.eventSessions.form_complete > micro * 0.1) return null;
      return {
        evidence: [
          `ボタンのクリック ${formatNumber(derived.eventSessions.primary_cta)} / 資料ダウンロード ${formatNumber(derived.eventSessions.document_download)} セッション`,
          `問い合わせの完了は ${formatNumber(derived.eventSessions.form_complete)} セッション`,
        ],
        impact: 0.6,
      };
    },
  }),
];

/** CRM が要るもの */
export const CTA_PENDING = [{ id: "K10", name: "資料ダウンロード後に商談が無い", needs: "CRM の商談データ（段階 G8）" }] as const;
