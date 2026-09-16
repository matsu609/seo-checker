/**
 * 診断結果を「読む人の順番」に並べ替える純関数（画面と PDF が共有する）。
 *
 * 126 ルールあるので、発火したものを全部そのまま並べると読めない。
 * 仕様書 §15 の「顧客向けの優先施策は原則として上位 3 件に絞る」に合わせて、
 * **まず 3 件 → 重要なものだけ → 残りは折りたたみ**の 3 段に分ける。
 */
import { ALL_RULES } from "./rules";
import type { DiagnosisResult, Ga4Summary, RuleSeverity, TriggeredRule } from "./types";

/** 先頭に大きく出す件数（§15） */
export const TOP_COUNT = 3;

export interface DiagnosisView {
  /** まず手を付けるところ（優先度の上位） */
  top: TriggeredRule[];
  /** 重大・高のうち、top に入らなかったもの */
  important: TriggeredRule[];
  /** 中・低。既定では折りたたむ */
  minor: TriggeredRule[];
  counts: Record<RuleSeverity, number>;
  /** 「発火 0 件」の理由。データが無いのか、問題が見つからないのか */
  emptyReason: "no-data" | "no-issues" | null;
}

export function buildDiagnosisView(result: DiagnosisResult): DiagnosisView {
  const triggered = result.triggered;
  const counts: Record<RuleSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const t of triggered) counts[t.severity] += 1;

  // データが無いことを言うだけのルール（D05）しか出ていないなら、それは「診断できていない」
  const onlyMissingData = triggered.length > 0 && triggered.every((t) => t.id === "D05");
  const top = triggered.slice(0, TOP_COUNT);
  const rest = triggered.slice(TOP_COUNT);

  return {
    top,
    important: rest.filter((t) => t.severity === "critical" || t.severity === "high"),
    minor: rest.filter((t) => t.severity === "medium" || t.severity === "low"),
    counts,
    emptyReason: triggered.length === 0 ? "no-issues" : onlyMissingData ? "no-data" : null,
  };
}

/* ───────────── 次に何をつなぐと、何が分かるか ───────────── */

export interface NextStep {
  /** 何をすればよいか（利用者の作業） */
  action: string;
  /** そうすると何が分かるか */
  unlocks: string;
  /** 増える診断項目の数 */
  count: number;
  /** 設定画面へのリンク（あれば） */
  href?: string;
}

/** ルール ID の頭文字から、その領域の実装済みルール数を数える */
function countRules(prefixes: readonly string[]): number {
  return ALL_RULES.filter((r) => prefixes.some((p) => r.id.startsWith(p))).length;
}

/**
 * 「まだつないでいないもの」を、利用者の行動に翻訳する。
 * 開発者向けのルール ID（A01〜A10 など）は出さない。
 */
export function nextSteps(result: DiagnosisResult, ga4: Ga4Summary | null): NextStep[] {
  const steps: NextStep[] = [];
  const hasGsc = result.summary !== null;
  const hasGa4 = ga4 !== null;

  if (!hasGsc) {
    steps.push({
      action: "Search Console と連携する",
      unlocks: "検索での見られ方（どの言葉で表示され、クリックされているか）を診断できます",
      count: countRules(["D", "T", "Q", "P", "V", "G", "U", "S"]),
      href: "/settings",
    });
  }
  if (!hasGa4) {
    steps.push({
      action: "GA4 と連携する",
      unlocks: "訪問したあとの行動（読まれているか、問い合わせボタンが押されているか、フォームで止まっていないか）を診断できます",
      count: countRules(["A", "L", "E", "K", "M"]),
      href: "/settings",
    });
  }
  if (hasGsc && hasGa4) {
    // 両方あるときだけ、イベントの割り当てが効く
    if (ga4 && ga4.mappingLines.length === 0) {
      steps.push({
        action: "設定画面で「GA4 イベントの割り当て」を行う",
        unlocks: "問い合わせボタンとフォームのどこで止まっているかを、段階ごとに切り分けられます",
        count: countRules(["K"]),
        href: "/settings",
      });
    } else if (ga4 && ga4.unmapped.length > 0) {
      steps.push({
        action: `設定画面で、未分類のイベント ${ga4.unmapped.length} 件を割り当てる`,
        unlocks: "問い合わせの数え方がより正確になります",
        count: 0,
        href: "/settings",
      });
    }
  }
  steps.push({
    action: "問い合わせ・有効リード・商談・受注の件数を記録する",
    unlocks: "アクセスではなく、売上への貢献で評価できます（準備中）",
    count: 10,
  });
  return steps;
}

/* ───────────── 訪問後の流れ ───────────── */

export interface FunnelStep {
  label: string;
  /** セッション数。計測できていなければ null */
  value: number | null;
  /** 1 つ前の段階からの通過率 */
  rate: number | null;
  rateLabel: string;
  /** その段階の「普通はこのくらい」の目安 */
  reference: number | null;
}

export interface FunnelView {
  steps: FunnelStep[];
  /**
   * いちばん落ちている段階。**素の率どうしを比べない**。
   * 訪問のうち問い合わせボタンを押すのは数 % が普通、フォームを開いた人のうち
   * 送信するのは半分くらいが普通、というように段階ごとに水準が違うため、
   * 「目安に対して何割まで届いているか」で比べる。
   */
  worst: { from: string; to: string; rate: number; reference: number; ratio: number } | null;
  /** 計測できていない段階があるか */
  hasUnmeasured: boolean;
}

export function buildFunnel(ga4: Ga4Summary): FunnelView {
  const ref = ga4.reference;
  const steps: FunnelStep[] = [
    { label: "訪問した", value: ga4.sessions, rate: null, rateLabel: "", reference: null },
    {
      label: "読まれた",
      value: ga4.engagementRate === null ? null : Math.round(ga4.sessions * ga4.engagementRate),
      rate: ga4.engagementRate,
      rateLabel: "訪問のうち",
      reference: ref.engagement,
    },
    { label: "問い合わせ導線を押した", value: ga4.ctaClickRate === null ? null : ga4.ctaSessions, rate: ga4.ctaClickRate, rateLabel: "訪問のうち", reference: ref.cta },
    { label: "フォームを開いた", value: ga4.formStartRate === null ? null : ga4.formStartSessions, rate: ga4.formStartRate, rateLabel: "押した人のうち", reference: ref.formStart },
    { label: "送信した", value: ga4.formCompletionRate === null ? null : ga4.formCompleteSessions, rate: ga4.formCompletionRate, rateLabel: "開いた人のうち", reference: ref.formComplete },
  ];

  let worst: FunnelView["worst"] = null;
  for (let i = 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.rate === null || step.value === null || step.reference === null || step.reference <= 0) continue;
    const ratio = step.rate / step.reference;
    // 目安を上回っている段階は「落ちている」とは言わない
    if (ratio >= 1) continue;
    if (worst === null || ratio < worst.ratio) {
      worst = { from: steps[i - 1].label, to: step.label, rate: step.rate, reference: step.reference, ratio };
    }
  }
  return { steps, worst, hasUnmeasured: steps.some((s) => s.value === null) };
}
